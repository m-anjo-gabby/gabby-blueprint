import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { getPersonaPassword } from "./personas.ts";
import { COACH_BASE_URL } from "./targets.ts";

/**
 * coachアプリの操作（コーチの画面操作を含むテスト用）。
 * テストの baseURL は student のため、coach は別のブラウザコンテキストで開く（adminApp.ts と同じ形）。
 * 接続先は e2e/support/targets.ts（dev はローカルの https://localhost:3002、ステージングは Vercel）。
 * coach の画面は英語表記のため、ロケーターの文言も英語で書く（CLAUDE.md 5章）。
 */

export { COACH_BASE_URL };

/** 状態ペルソナのコーチ（testing/FIXTURES.md）。生徒01（qa-student-01）の担当コーチ。閲覧の確認だけに使う */
export const QA_COACH_EMAIL = "qa-coach-ca-01@gabby-qa-test.example";

/**
 * コーチとしてログインしたコンテキストを作る（既定は固定アカウントの qa-coach-ca-01）。
 * 使い捨てのコーチは email / password を渡す。
 */
export async function openCoachContext(
  browser: Browser,
  account: { email: string; password: string } = { email: QA_COACH_EMAIL, password: getPersonaPassword() }
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: COACH_BASE_URL,
    ignoreHTTPSErrors: true,
    locale: "en-US",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await autoCloseNoticePopup(page);

  await page.goto("/login");
  await page.locator("input[name=email]").fill(account.email);
  await page.locator("input[name=password]").fill(account.password);
  await page.locator("input[name=password]").press("Enter");
  // ログイン後の画面（ダッシュボード）への移動が終わるまで待つ。待たずに別の画面を開くと、遅れて届いた移動に上書きされる
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return { context, page };
}

/**
 * 重要なお知らせのポップアップ（ダッシュボードで未読があると自動表示）を自動で閉じる。
 * 右上の「Close」は表示を閉じるだけで、既読状態などのDBは変更しない。
 */
async function autoCloseNoticePopup(page: Page): Promise<void> {
  const popup = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: /^(Next notice →|Got it)$/ }) });
  await page.addLocatorHandler(popup, async (dialog) => {
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  });
}

/** サイドバーのナビ（PC表示） */
export const coachNav = (page: Page): Locator => page.locator("aside nav");

/** 共通の確認ダイアログ（`useConfirm`。packages/lib/components/common/ConfirmModal.tsx） */
export const confirmModal = (page: Page): Locator => page.locator("[data-confirm-modal]");
