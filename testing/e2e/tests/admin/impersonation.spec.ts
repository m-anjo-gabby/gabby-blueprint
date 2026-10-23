import { openAdminContext } from '../../support/adminApp.ts';
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  grantAppLicense,
  type AuthFixture,
} from '../../support/authFixtures.ts';
import { clickUntilVisible } from '../../support/hydration.ts';
import { expect, test } from '../../support/studentApp.ts';
import { STUDENT_BASE_URL } from '../../support/targets.ts';

/**
 * 代理ログイン（機能: e2e/specs/admin/impersonation.md）。
 *
 * アドミンが理由を入れて生徒への代理ログインを始めると、生徒のポータルが本人として開き、監査の記録に使用日時が入る。
 * 代理ログインに期限は無く、印の Cookie は本人のセッションと同じだけ残り、対象の本人を持つ。同じリンクは2回使えない。
 * admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = 'Impersonate2026a';
const DAY_SECONDS = 24 * 60 * 60;

let fixture: AuthFixture | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    '使い捨てデータを作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する',
  );
});

test.afterEach(async () => {
  if (fixture) {
    await fixture.admin.from('com_t_admin_impersonation_log').delete().in('target_user_id', fixture.userIds);
  }
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

test('生徒への代理ログインは期限なしで本人として開き、印の Cookie が本人に結び付き、同じリンクは2回使えない', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const f = await createAuthFixture('impersonate');
  fixture = f;
  const studentName = `E2E生徒 ${f.tag}`;
  const studentId = await createDisposableStudent(f, {
    email: `${f.tag}-student@example.com`,
    password: PASSWORD,
    userName: studentName,
  });
  await grantAppLicense(f, studentId);

  const { context, page: admin } = await openAdminContext(browser);
  try {
    let impersonateUrl = '';

    await test.step('ユーザー詳細から理由を入れて実行すると、生徒のポータルが本人として開く', async () => {
      await admin.goto(`/users/${studentId}`);
      const dialog = admin.getByRole('dialog', { name: '代理ログイン' });
      await clickUntilVisible(admin.getByRole('button', { name: '代理ログイン' }), dialog);
      await expect(dialog).toContainText('代理ログインに時間の制限はありません');
      await dialog.getByRole('textbox').fill(`E2E の確認（${f.tag}）`);

      const impersonateRequest = context.waitForEvent('request', (r) => r.url().includes('/auth/impersonate'));
      const popupOpened = context.waitForEvent('page');
      await dialog.getByRole('button', { name: '生徒ポータルを開く' }).click();
      impersonateUrl = (await impersonateRequest).url();
      const popup = await popupOpened;
      await popup.waitForURL('**/dashboard', { timeout: 60_000 });
    });

    await test.step('監査の記録に使用日時が入り、印の Cookie は本人を持ち、本人のセッションと同じだけ残る', async () => {
      const { data: log } = await f.admin
        .from('com_t_admin_impersonation_log')
        .select('impersonation_id, admin_id, reason, redeemed_at')
        .eq('target_user_id', studentId)
        .single();
      expect(log?.redeemed_at).not.toBeNull();
      expect(log?.reason).toBe(`E2E の確認（${f.tag}）`);

      const cookie = (await context.cookies(STUDENT_BASE_URL)).find((c) => c.name === 'imp_session');
      expect(cookie?.httpOnly).toBe(true);
      // 期限（30分）で印だけが消えて、以降の操作が本人の操作としてログに残ることがないよう、長く残す
      expect((cookie?.expires ?? 0) - Date.now() / 1000).toBeGreaterThan(300 * DAY_SECONDS);
      const payload: unknown = JSON.parse(Buffer.from(cookie?.value ?? '', 'base64url').toString('utf-8'));
      expect(payload).toEqual({ id: log?.impersonation_id, adminId: log?.admin_id, targetUserId: studentId });
    });

    await test.step('同じリンクをもう一度開くと、セッションを作らずにログイン画面の案内になる', async () => {
      // ログイン中のブラウザではログイン画面からホームへ移るため、ログインしていない別のブラウザで開く
      const other = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        const again = await other.newPage();
        await again.goto(impersonateUrl);
        await again.waitForURL('**/login?error=impersonation', { timeout: 60_000 });
        // 監査の記録の確認を先に行うため、本人のセッション（Supabase の認証の Cookie）も作られない
        const names = (await other.cookies(STUDENT_BASE_URL)).map((c) => c.name);
        expect(names.filter((name) => name === 'imp_session' || name.startsWith('sb-'))).toEqual([]);
      } finally {
        await other.close();
      }
    });
  } finally {
    await context.close();
  }
});
