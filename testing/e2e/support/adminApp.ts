import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { clickUntilVisible } from "./hydration.ts";
import { getPersonaPassword } from "./personas.ts";

/**
 * adminアプリの操作（アドミンの画面操作を含むジャーニー用）。
 * テストの baseURL は student のため、admin は別のブラウザコンテキストで開く。
 * 接続先は e2e/support/targets.ts（dev はローカルの https://localhost:3001、ステージングは Vercel）。
 */

import { ADMIN_BASE_URL } from "./targets.ts";

export { ADMIN_BASE_URL };

/** 状態ペルソナのアドミン（testing/FIXTURES.md）。アドミン専用の操作の実行者 */
export const QA_ADMIN_EMAIL = "qa-admin@gabby-qa-test.example";

/**
 * アドミンとしてログインしたコンテキストを作る。
 * admin は表示言語の Cookie が無いと英語で表示するため、日本語（NEXT_LOCALE=ja）に固定する。
 */
export async function openAdminContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: ADMIN_BASE_URL,
    ignoreHTTPSErrors: true,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1440, height: 900 },
  });
  await context.addCookies([{ name: "NEXT_LOCALE", value: "ja", url: ADMIN_BASE_URL }]);

  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("input[name=email]").fill(QA_ADMIN_EMAIL);
  await page.locator("input[name=password]").fill(getPersonaPassword());
  await page.locator("input[name=password]").press("Enter");
  // ログイン後の画面（ダッシュボード）への移動が終わるまで待つ。待たずに別の画面を開くと、遅れて届いた移動に上書きされる
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return { context, page };
}

/** ダイアログを開くボタン等を、ダイアログが開くまで押す（ハイドレーション前の押下対策。support/hydration.ts） */
export async function openDialogBy(page: Page, trigger: Locator): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  await clickUntilVisible(trigger, dialog);
  return dialog;
}

/** 確認画面つきのフォーム（「〜内容を確認する」→「はい、確定します」）を送信し、完了のトーストを待つ */
export async function confirmAndSubmit(page: Page, confirmLabel: RegExp, toast: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: confirmLabel }).click();
  await dialog.getByRole("button", { name: "はい、確定します" }).click();
  await expect(page.getByText(toast)).toBeVisible();
}

/**
 * ライブセッション管理（`/live-sessions`）を開き、顧客・生徒を選ぶ（現在の契約が自動で選ばれる）。
 * 検索は使い捨てデータのタグで絞る（顧客名・生徒の表示はタグを含む前提）。
 */
export async function openLiveSessionsFor(
  page: Page,
  target: { tag: string; clientName: string; studentName: string; studentEmail: string }
): Promise<void> {
  await page.goto("/live-sessions");
  await expect(page.getByRole("heading", { level: 1, name: "ライブセッション管理" })).toBeVisible();
  const [clientSelect, studentSelect] = [page.getByRole("combobox").nth(0), page.getByRole("combobox").nth(1)];
  await clickUntilVisible(clientSelect, page.getByPlaceholder("顧客名で検索..."));
  await page.getByPlaceholder("顧客名で検索...").fill(target.tag);
  await page.getByRole("option", { name: target.clientName }).click();
  await expect(studentSelect).toBeEnabled();
  await studentSelect.click();
  await page.getByPlaceholder("生徒名・メールで検索...").fill(target.tag);
  await page.getByRole("option", { name: `${target.studentName}（${target.studentEmail}）` }).click();
}

/** ライブセッション管理の定期スケジュール枠の行（稼働中・終了済みの枠は「第n枠: 曜日 時刻〜時刻（タイムゾーン）」、未割当の枠は案内文で絞る） */
export const scheduleSlotRow = (page: Page, text: string): Locator => page.getByTestId("schedule-slot").filter({ hasText: text });
