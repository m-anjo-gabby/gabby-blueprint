import type { Page } from '@playwright/test';
import { WEB_TRIAL_CLIENT_ID } from '../../../../packages/types/trialApplication.ts';
import { confirmAndSubmit, openAdminContext, openDialogBy } from '../../support/adminApp.ts';
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
 * 顧客の取引状態と、顧客単位の一括削除（仕様書: e2e/specs/admin/data-deletion.md フロー3・4、異常系 #5）。
 * 使い捨ての顧客で確かめ、admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 * Webトライアルの顧客は件数の取得（予行）だけを行い、何も消さない。
 */

const PASSWORD = 'ClientPurge2026a';

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

const clientName = (f: AuthFixture) => `【QAテスト】認証E2E（${f.tag}）`;

/** 顧客一覧を顧客名で絞り、その顧客の編集ダイアログを開く */
async function openClientEditor(page: Page, name: string, search: string) {
  await page.goto(`/clients?q=${encodeURIComponent(search)}`);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  return { row, dialog: await openDialogBy(page, row.getByRole('button', { name: '編集' })) };
}

test('取引終了にすると一覧に目印が付く', async ({ browser }) => {
  fixture = await createAuthFixture('clientend');
  const f = fixture;
  const { context, page } = await openAdminContext(browser);
  try {
    const { row, dialog } = await openClientEditor(page, clientName(f), f.tag);
    await dialog.getByLabel('取引状態').click();
    await page.getByRole('option', { name: '取引終了' }).click();
    await confirmAndSubmit(page, /編集内容を確認する/, '顧客を更新しました');
    await expect(row.getByText('取引終了')).toBeVisible();
    const { data } = await f.admin.from('com_m_client').select('status').eq('client_id', f.clientId).single();
    expect(data?.status).toBe(9);
  } finally {
    await context.close();
  }
});

test('件数を確かめて顧客名を入力すると、顧客を所属するユーザー・契約ごと削除する', async ({ browser }) => {
  fixture = await createAuthFixture('clientpurge');
  const f = fixture;
  const userId = await createDisposableStudent(f, {
    email: `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`,
    password: PASSWORD,
  });
  await grantAppLicense(f, userId);

  const { context, page } = await openAdminContext(browser);
  try {
    const { dialog } = await openClientEditor(page, clientName(f), f.tag);
    const confirm = page.getByRole('alertdialog');
    await clickUntilVisible(dialog.getByRole('button', { name: '顧客を削除する' }), confirm);

    await test.step('消える件数を表示する', async () => {
      const count = (label: string) =>
        confirm
          .locator('dl > div')
          .filter({ has: page.locator('dt').getByText(label, { exact: true }) })
          .locator('dd');
      await expect(count('生徒')).toHaveText('1');
      await expect(count('契約')).toHaveText('1');
      await expect(count('ライセンス')).toHaveText('1');
    });

    await test.step('顧客名を入力すると削除できる', async () => {
      const purge = confirm.getByRole('button', { name: '顧客を削除する' });
      await expect(purge).toBeDisabled();
      await confirm.getByLabel('確認のため、顧客名を入力してください').fill(clientName(f));
      await purge.click();
      await expect(page.getByText('顧客を削除しました')).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: clientName(f) })).toHaveCount(0);
    });

    await test.step('顧客・ユーザー・契約・認証のアカウントが消え、削除の記録が残る', async () => {
      const { count: clients } = await f.admin
        .from('com_m_client')
        .select('client_id', { count: 'exact', head: true })
        .eq('client_id', f.clientId);
      const { count: users } = await f.admin
        .from('com_m_user')
        .select('id', { count: 'exact', head: true })
        .eq('id', userId);
      const { count: contracts } = await f.admin
        .from('com_m_contract')
        .select('contract_id', { count: 'exact', head: true })
        .eq('client_id', f.clientId);
      const { data: auth } = await f.admin.auth.admin.getUserById(userId);
      expect({ clients, users, contracts, auth: auth.user }).toEqual({
        clients: 0,
        users: 0,
        contracts: 0,
        auth: null,
      });
      const { count: logs } = await f.admin
        .from('com_t_data_deletion_log')
        .select('log_id', { count: 'exact', head: true })
        .eq('kind', 'purge_client')
        .eq('target_id', f.clientId);
      expect(logs).toBe(1);
    });
  } finally {
    await context.close();
    await f.admin.from('com_t_data_deletion_log').delete().eq('target_id', f.clientId);
  }
});

test('Webトライアルの顧客は削除できない', async ({ browser }) => {
  fixture = await createAuthFixture('clientprot');
  const { data: trialClient } = await fixture.admin
    .from('com_m_client')
    .select('client_name')
    .eq('client_id', WEB_TRIAL_CLIENT_ID)
    .single();
  if (!trialClient) throw new Error('Webトライアルの顧客がありません');
  const { context, page } = await openAdminContext(browser);
  try {
    const { dialog } = await openClientEditor(page, trialClient.client_name, trialClient.client_name);
    const confirm = page.getByRole('alertdialog');
    await clickUntilVisible(dialog.getByRole('button', { name: '顧客を削除する' }), confirm);
    await expect(confirm.getByText('この顧客（初期テナント・Webトライアル）は削除できません')).toBeVisible();
    await expect(confirm.getByLabel('確認のため、顧客名を入力してください')).toBeDisabled();
    await expect(confirm.getByRole('button', { name: '顧客を削除する' })).toBeDisabled();
  } finally {
    await context.close();
  }
});
