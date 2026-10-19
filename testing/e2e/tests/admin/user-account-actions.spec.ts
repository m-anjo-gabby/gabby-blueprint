import type { Page } from '@playwright/test';
import { signInAsRole, signOutRole } from '../../../helpers/auth.ts';
import { openAdminContext } from '../../support/adminApp.ts';
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  DISPOSABLE_EMAIL_DOMAIN,
  grantAppLicense,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { clickUntilVisible } from '../../support/hydration.ts';
import { expect, test } from '../../support/studentApp.ts';

/**
 * ユーザーの停止・再開・退会（仕様書: e2e/specs/admin/data-deletion.md フロー1・2、異常系 #1・#3・#11）。
 * 使い捨ての顧客・生徒で確かめ、admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 * ログインできるかは、生徒のアカウントでのサインイン（Supabase Auth）で確かめる。
 */

const PASSWORD = 'AccountOps2026a';

let fixture: AuthFixture | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    '使い捨てデータを作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する',
  );
});

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

async function prepareStudent(prefix: string) {
  fixture = await createAuthFixture(prefix);
  const email = `${fixture.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const userName = `E2Eアカウント操作（${fixture.tag}）`;
  const userId = await createDisposableStudent(fixture, { email, password: PASSWORD, userName });
  await grantAppLicense(fixture, userId);
  return { f: fixture, email, userName, userId };
}

const canSignIn = (email: string) =>
  signInAsRole(email, PASSWORD).then(
    async (client) => {
      await signOutRole(client);
      return true;
    },
    () => false,
  );

const accountSection = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'アカウントの操作' }) });

test('停止するとログインできなくなり、再開すると戻る', async ({ browser }) => {
  const { email, userName, userId } = await prepareStudent('acctsusp');
  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto(`/users/${userId}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(userName);
    const section = accountSection(page);

    await test.step('停止する', async () => {
      const dialog = page.getByRole('alertdialog');
      await clickUntilVisible(section.getByRole('button', { name: '利用を停止する' }), dialog);
      await dialog.getByRole('button', { name: '利用を停止する' }).click();
      await expect(page.getByText('利用を停止しました')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toContainText('停止中');
      await expect(section.getByRole('button', { name: '利用を再開する' })).toBeVisible();
      // 停止中は代理ログインの対象外
      await expect(page.getByRole('button', { name: '代理ログイン' })).toHaveCount(0);
      expect(await canSignIn(email)).toBe(false);
    });

    await test.step('再開する', async () => {
      await section.getByRole('button', { name: '利用を再開する' }).click();
      await expect(page.getByText('利用を再開しました')).toBeVisible();
      await expect(section.getByRole('button', { name: '利用を停止する' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).not.toContainText('停止中');
      expect(await canSignIn(email)).toBe(true);
    });
  } finally {
    await context.close();
  }
});

test('有効なライセンスがあると退会できず、停止後は個人情報を消して記録を残す', async ({ browser }) => {
  const { f, email, userName, userId } = await prepareStudent('acctwd');
  const { error: legalError } = await f.admin.from('com_m_user_legal').insert({
    user_id: userId,
    last_name: '山田',
    first_name: '太郎',
    last_name_latin: 'Yamada',
    first_name_latin: 'Taro',
  });
  if (legalError) throw new Error(`正式氏名の登録に失敗しました: ${legalError.message}`);

  const { context, page } = await openAdminContext(browser);
  try {
    await page.goto(`/users/${userId}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(userName);
    const dialog = page.getByRole('alertdialog');
    const openWithdraw = () =>
      clickUntilVisible(accountSection(page).getByRole('button', { name: '退会させる' }), dialog);

    await test.step('有効なライセンスがあると中断する', async () => {
      await openWithdraw();
      const confirm = dialog.getByRole('button', { name: '退会させる' });
      await expect(confirm).toBeDisabled();
      await dialog.getByLabel('確認のため、ユーザーの表示名を入力してください').fill(userName);
      await confirm.click();
      await expect(dialog.getByText('有効なライセンスがあります。先にライセンスを停止してください')).toBeVisible();
      await dialog.getByRole('button', { name: 'キャンセル' }).click();
      const { data: user } = await f.admin.from('com_m_user').select('status, user_name').eq('id', userId).single();
      expect(user).toEqual({ status: 1, user_name: userName });
    });

    await test.step('ライセンスを停止すると退会できる', async () => {
      await f.admin.from('com_t_user_license').update({ status: 0 }).eq('user_id', userId);
      await openWithdraw();
      await dialog.getByLabel('確認のため、ユーザーの表示名を入力してください').fill(userName);
      await dialog.getByRole('button', { name: '退会させる' }).click();
      await expect(page.getByText('退会の処理が完了しました')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toContainText('退会済み');
      await expect(accountSection(page).getByText(/退会済みです/)).toBeVisible();
      await expect(accountSection(page).getByRole('button')).toHaveCount(0);
    });

    await test.step('個人情報は消え、業務の記録は残る', async () => {
      const { data: user } = await f.admin.from('com_m_user').select('status, user_name').eq('id', userId).single();
      expect(user).toEqual({ status: 9, user_name: '退会済みユーザー' });
      const { data: auth } = await f.admin.auth.admin.getUserById(userId);
      expect(auth.user).toBeNull();
      const { count: legal } = await f.admin
        .from('com_m_user_legal')
        .select('user_id', { count: 'exact', head: true })
        .eq('user_id', userId);
      expect(legal).toBe(0);
      const { count: licenses } = await f.admin
        .from('com_t_user_license')
        .select('license_id', { count: 'exact', head: true })
        .eq('user_id', userId);
      expect(licenses).toBe(1);
      expect(await canSignIn(email)).toBe(false);
    });
  } finally {
    await context.close();
    // 退会の記録はテストのデータのため消す
    await f.admin.from('com_t_data_deletion_log').delete().eq('target_id', userId);
  }
});
