import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { getPersonaPassword } from "./personas.ts";

/**
 * adminアプリの操作（アドミンの画面操作を含むジャーニー用）。
 * テストの baseURL は student のため、admin は別のブラウザコンテキストで開く。
 * 起動は playwright.config.ts の webServer（https://localhost:3001）。
 */

export const ADMIN_BASE_URL = process.env.E2E_ADMIN_BASE_URL ?? "https://localhost:3001";

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
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { context, page };
}

/** 確認画面つきのフォーム（「〜内容を確認する」→「はい、確定します」）を送信し、完了のトーストを待つ */
export async function confirmAndSubmit(page: Page, confirmLabel: RegExp, toast: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: confirmLabel }).click();
  await dialog.getByRole("button", { name: "はい、確定します" }).click();
  await expect(page.getByText(toast)).toBeVisible();
}
