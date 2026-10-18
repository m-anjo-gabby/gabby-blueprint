import { expect, test, type Page } from '@playwright/test';
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableCoach,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { confirmModal, openCoachContext } from '../../support/coachApp.ts';

/**
 * コーチのプロフィールの Student matching カードと必須項目のバッジ（画面: docs/screens/coach/profile.md、
 * 機能: e2e/specs/matching/coach-matching.md「コーチのプロフィールの Student matching カード」）。
 * - 未設定の項目の案内（空き時間は /availability へのリンク）
 * - Public Coach Profile の必須項目のバッジは入力中の値で数え、Student matching カードは保存した内容で判定する
 * - アイコンの削除は Student matching カードにすぐ反映される
 * - 受付スイッチの保存に失敗すると（通信の失敗を含む）、スイッチを元に戻してエラーを出す
 *
 * コーチは使い捨て（空き時間なし・学歴と自己紹介を空にする）。アイコンの削除は保存先のファイルも消すため、
 * 共有の QA 用アイコンを消さないよう、テスト専用の存在しないパスに差し替えてから削除する。
 */

const PASSWORD = 'CoachCard2026a';

let fixture: AuthFixture | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    '使い捨てデータを作り、coach は PC 表示の別コンテキストで開くため desktop だけで実行する',
  );
});

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

const matchingCard = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: 'Student matching' }) });

/** Public Coach Profile の見出しの横の必須項目のバッジ */
const requiredBadge = (page: Page) => page.getByText(/^(\d+ \/ 6 required fields|Required fields complete)$/);

async function createIncompleteCoach(prefix: string): Promise<{ f: AuthFixture; coachId: string; email: string }> {
  const f = await createAuthFixture(prefix);
  fixture = f;
  const email = `${f.tag}-coach@${DISPOSABLE_EMAIL_DOMAIN}`;
  const coachId = await createDisposableCoach(f, {
    email,
    password: PASSWORD,
    userName: `E2E Coach ${f.tag}`,
    timezone: 'Asia/Tokyo',
    availability: [],
  });
  const { error } = await f.admin
    .from('com_m_coach_profile')
    .update({ education: '', introduction: '' })
    .eq('user_id', coachId);
  if (error) throw new Error(`プロフィールの更新に失敗しました: ${error.message}`);
  const { error: iconError } = await f.admin
    .from('com_m_user')
    .update({ icon_path: `e2e/${f.tag}.png` })
    .eq('id', coachId);
  if (iconError) throw new Error(`アイコンの差し替えに失敗しました: ${iconError.message}`);
  return { f, coachId, email };
}

test('未設定の項目の案内とリンクが出て、バッジは入力中の値で、カードは保存した内容とアイコンの削除で更新される', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const { f, coachId, email } = await createIncompleteCoach('coachcard');
  const { context, page } = await openCoachContext(browser, { email, password: PASSWORD });
  try {
    await page.goto('/profile');
    const card = matchingCard(page);

    await test.step('未設定の項目が並び、空き時間は /availability へのリンクになる', async () => {
      await expect(card).toContainText('Not visible to students');
      await expect(card).toContainText('Complete the following to appear in the coach search:');
      await expect(card.getByRole('listitem')).toHaveText([
        /^Education — Fill it in under Public Coach Profile$/,
        /^Personal introduction — Fill it in under Public Coach Profile$/,
        /^Weekly availability — Set your availability$/,
      ]);
      await expect(card.getByRole('link', { name: 'Set your availability' })).toHaveAttribute('href', '/availability');
      await expect(requiredBadge(page)).toHaveText('4 / 6 required fields');
    });

    await test.step('必須項目のバッジは入力中の値で数え、カードは保存するまで変わらない', async () => {
      await page.getByPlaceholder(/^e\.g\. University of Alberta/).fill(`University of Testing (${f.tag})`);
      await expect(requiredBadge(page)).toHaveText('5 / 6 required fields');
      await page
        .getByPlaceholder('Tell students a bit about yourself and your teaching style.')
        .fill(`Hello from ${f.tag}.`);
      await expect(requiredBadge(page)).toHaveText('Required fields complete');
      await expect(card.getByRole('listitem')).toHaveCount(3);
    });

    await test.step('保存すると、カードから入力した項目が消える（空き時間は残る）', async () => {
      await page.getByRole('button', { name: 'Save Public Profile' }).click();
      await expect(page.getByText('Public profile updated successfully')).toBeVisible();
      await expect(card.getByRole('listitem')).toHaveText([/^Weekly availability/]);
      await expect(card).toContainText('Not visible to students');
    });

    await test.step('アイコンを削除すると、カードにすぐ「Profile photo」が加わる', async () => {
      await page.getByRole('button', { name: 'Remove Image' }).click();
      const modal = confirmModal(page);
      await expect(modal).toContainText('Remove profile icon?');
      await modal.getByRole('button', { name: 'Remove Image' }).click();
      await expect(page.getByText('Profile icon removed')).toBeVisible();
      await expect(card.getByRole('listitem')).toHaveText([
        /^Profile photo — Upload it in the account section below$/,
        /^Weekly availability/,
      ]);
      const { data: user } = await f.admin.from('com_m_user').select('icon_path').eq('id', coachId).single();
      expect(user?.icon_path).toBeNull();
    });

    await test.step('空き時間のリンクから空き時間の画面へ移る', async () => {
      await card.getByRole('link', { name: 'Set your availability' }).click();
      await page.waitForURL('**/availability');
    });
  } finally {
    await context.close();
  }
});

test('受付スイッチの保存に失敗すると、スイッチを元に戻してエラーを出す', async ({ browser }) => {
  test.setTimeout(120_000);
  const { f, coachId, email } = await createIncompleteCoach('coachcardfail');
  const { context, page } = await openCoachContext(browser, { email, password: PASSWORD });
  try {
    await page.goto('/profile');
    const toggle = matchingCard(page).getByRole('switch', { name: 'Accept new students' });
    await expect(toggle).toBeChecked();

    // 保存（サーバーアクション）の通信を失敗させる
    await page.route('**/profile', async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) await route.abort('failed');
      else await route.continue();
    });
    await toggle.click();

    await expect(toggle).toBeChecked();
    await expect(toggle).toBeEnabled();
    await expect(
      page.getByText('Could not save your setting. Please check your connection and try again.'),
    ).toBeVisible();
    const { data: profile } = await f.admin
      .from('com_m_coach_profile')
      .select('accepting_students')
      .eq('user_id', coachId)
      .single();
    expect(profile?.accepting_students).toBe(true);
  } finally {
    await context.close();
  }
});
