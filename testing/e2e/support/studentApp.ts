import { expect, test as base, type Locator, type Page } from "@playwright/test";

/**
 * studentアプリ共通の操作・ロケーター。
 * 画面ごとの細かなロケーターはテスト側に書き、複数テストで使うものだけをここに置く。
 */

/** アプリシェルのメインナビ（モバイル=ボトムタブ／PC=サイドナビ。表示中の方だけが取得される） */
export const mainNav = (page: Page): Locator => page.getByRole("navigation", { name: "メインナビゲーション" });

/**
 * ナビのタブ（リンク）。文字列はラベルの前方一致（PCの「ライブセッション」をモバイル表記の「ライブ」でも指定できる）。
 * チャットは未読があると件数がラベルの前に付く（例: 「4 チャット」）ため、先頭の件数は読み飛ばす。
 */
export const navTab = (page: Page, label: string | RegExp): Locator =>
  mainNav(page).getByRole("link", { name: typeof label === "string" ? new RegExp(`^(\\d+\\+? )?${label}`) : label });

/**
 * 重要なお知らせのポップアップ（表示タイミングが非同期で一定しない）を自動で閉じる。
 * 「閉じる」は画面上の表示を閉じるだけで、既読状態などのDBは変更しない。
 */
async function autoCloseNoticePopup(page: Page): Promise<void> {
  const popup = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: /次のお知らせ|確認しました/ }) });
  await page.addLocatorHandler(popup, async (dialog) => {
    await dialog.getByRole("button", { name: "閉じる" }).click();
  });
}

/**
 * 最新規約への同意モーダルが出ていれば、利用者と同じ操作（本文を最下部までスクロール→同意）で同意する。
 * 固定アカウントは「最新規約に同意済みの通常利用者」を前提とする（testing/FIXTURES.md）。
 * @returns 同意操作を行った場合 true
 */
export async function agreeToPendingTerms(page: Page): Promise<boolean> {
  // モーダルはハイドレーション後にクライアント側で表示されるため、通信が落ち着いてから判定する
  await page.waitForLoadState("networkidle");
  const scrollHint = page.getByRole("button", { name: /規約を最下部までスクロールして確認|同意して次へ進む/ });
  if (!(await scrollHint.isVisible())) return false;

  const dialog = page.getByRole("dialog").filter({ has: scrollHint });
  const tabs = dialog.getByRole("tab");
  const tabCount = await tabs.count();

  // 規約が複数ある場合はタブごとに本文を最下部までスクロールする
  for (let i = 0; i < Math.max(tabCount, 1); i++) {
    if (tabCount > 0) await tabs.nth(i).click();
    await dialog.evaluate((root) => {
      root.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const { overflowY } = getComputedStyle(el);
        if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight && el.offsetParent) {
          el.scrollTop = el.scrollHeight;
          el.dispatchEvent(new Event("scroll", { bubbles: true }));
        }
      });
    });
  }

  await dialog.getByRole("button", { name: "同意して次へ進む" }).click();
  await expect(dialog).toBeHidden();
  return true;
}

/** 使い捨ての新しい生徒でログインし、必ず出る規約同意を済ませる（同意の保存が終わる＝モーダルが閉じるまで待つ） */
export async function loginAsNewStudent(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL("**/dashboard");
  const termsDialog = page.getByRole("dialog", { name: "利用規約への同意" });
  await expect(termsDialog).toBeVisible();
  await agreeToPendingTerms(page);
  await expect(termsDialog).toHaveCount(0);
}

/** studentアプリ用の test。お知らせポップアップの自動クローズを全テストに適用する */
export const test = base.extend({
  page: async ({ page }, use) => {
    await autoCloseNoticePopup(page);
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright のフィクスチャの use（React のフックではない）
    await use(page);
  },
});

export { expect };
