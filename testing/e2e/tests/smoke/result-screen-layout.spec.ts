import type { Page } from "@playwright/test";
import { storageStatePath } from "../../support/personas.ts";
import { expect, mainNav, navTab, test } from "../../support/studentApp.ts";

/**
 * スモーク: 結果画面のレイアウト出し分け（docs/screens/student/training/sprint-result.md、
 * docs/screens/student/live-room/session-result.md）。
 * - スプリント結果: 履歴から開くとシェル画面（ナビあり・戻る先は履歴）、実施直後の URL は没入画面（ナビなし・戻る先はスプリント選択）
 * - ライブセッション結果: シェル画面（ナビあり）
 * 閲覧のみ（DBは変更しない）。
 */

/** 固定アカウントの学習履歴は毎月10日(JST)に投入されるため、確実に履歴がある前月を使う */
function previousMonthInJst(): string {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** スプリントの履歴から最初のスプリント結果（シェル画面）を開き、その self_sprint_id を返す */
async function openSprintResultFromHistory(page: Page, month: string): Promise<string> {
  await page.goto(`/training/sprint/history?month=${month}`);
  await expect(page.getByRole("heading", { level: 1, name: "スプリントの履歴" })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(`^${month.replace("-", "/")}/\\d{2}`) }).first().click();
  const sprintItem = page.locator('button[id^="session-"]').first();
  await sprintItem.click();

  await page.waitForURL(/\/training\/sprint\/history\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}

test.describe("スプリント結果画面", () => {
  test.use({ storageState: storageStatePath("liveStudent") });

  test("履歴から開くとナビ付きの画面で表示され、戻るで該当月・該当セッションの履歴へ戻る", async ({ page }) => {
    const month = previousMonthInJst();
    const sprintId = await openSprintResultFromHistory(page, month);

    await expect(page.getByRole("heading", { level: 1, name: "スプリント結果" })).toBeVisible();
    await expect(navTab(page, "トレーニング")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "全て再生" })).toBeVisible();
    await expect(page.getByRole("link", { name: "スプリントをリトライ" })).toHaveAttribute(
      "href",
      /^\/training\/sprint\/play\?mode=sprint&/
    );

    await page.getByRole("link", { name: "戻る" }).click();
    await page.waitForURL(/\/training\/sprint\/history\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("month")).toBe(month);
    expect(url.searchParams.get("focus")).toBe(sprintId);
    await expect(page.locator(`#session-${sprintId}`)).toBeVisible();
  });

  test("実施直後の結果URLはナビなしの没入画面で表示され、戻る先はスプリント選択になる", async ({ page }) => {
    const sprintId = await openSprintResultFromHistory(page, previousMonthInJst());

    await page.goto(`/training/sprint/result/${sprintId}`);
    await expect(page.getByText("スプリント結果", { exact: true })).toBeVisible();
    await expect(mainNav(page)).toHaveCount(0);

    await expect(page.getByRole("link", { name: "スプリント選択に戻る" })).toHaveAttribute(
      "href",
      /^\/training\/sprint\/play\?mode=sprint&sprint_type=\d+&content_id=[0-9a-f-]{36}$/
    );
    await expect(page.getByRole("link", { name: "ホームに戻る" })).toHaveAttribute("href", "/dashboard");
    // 実施直後はまず「全て再生」を主役にし、リトライは控えめなリンクとして併記する
    await expect(page.getByRole("button", { name: "全て再生" })).toBeVisible();
    await expect(page.getByRole("link", { name: /スプリントをリトライ/ })).toBeVisible();
  });
});

test.describe("ライブセッション結果画面", () => {
  test.use({ storageState: storageStatePath("liveStudent") });

  test("実施済みセッションの結果はナビ付きの画面で表示され、戻るでライブセッション画面へ戻る", async ({ page }) => {
    await page.goto("/live-room");
    await page.getByRole("tab", { name: "実施済み" }).click();

    const resultLink = page.locator('a[href^="/live-room/sessions/"][href$="/result"]').first();
    const emptyMessage = page.getByText("実施済みのセッションはありません");
    await expect(resultLink.or(emptyMessage)).toBeVisible();
    test.skip(await emptyMessage.isVisible(), "固定アカウントに実施済みセッションが無い");

    await resultLink.click();
    await page.waitForURL(/\/live-room\/sessions\/[0-9a-f-]{36}\/result$/);
    await expect(page.getByRole("heading", { level: 1, name: "セッション結果" })).toBeVisible();
    await expect(navTab(page, "ライブ")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 2, name: "宿題" })).toBeVisible();

    await page.getByRole("button", { name: "戻る" }).click();
    await page.waitForURL(/\/live-room$/);
  });
});
