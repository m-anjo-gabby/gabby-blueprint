import { expect, test, type Locator, type Page } from "@playwright/test";
import { storageStatePath } from "../../support/personas.ts";
import { agreeToPendingTerms, navTab } from "../../support/studentApp.ts";
import {
  clearPopupNotices,
  createPopupNotices,
  loadPopupFixture,
  markOtherNoticesRead,
  readNoticeTitles,
  resetTermsAgreement,
  type PopupFixture,
} from "../../support/popupFixtures.ts";

/**
 * 生徒アプリのポップアップ制御（PopupHost）。仕様: docs/screens/student/dashboard.md「ポップアップ表示」
 *
 * - 規約同意（ゲート）が未解決の間は、お知らせを表示しない
 * - お知らせの自動表示はダッシュボードのみ
 * - 閉じたときは、実際に表示したお知らせだけを既読にする
 *
 * 専用ペルソナ（qa-student-07）の規約同意・お知らせを各テストで作り直すため、
 * studentApp.ts の test（お知らせを自動で閉じる）ではなく素の test を使う。
 */
test.use({ storageState: storageStatePath("popupStudent") });

const noticeDialog = (page: Page): Locator =>
  page.getByRole("dialog").filter({ has: page.getByRole("button", { name: /次のお知らせ|確認しました/ }) });

const termsDialog = (page: Page): Locator =>
  page.getByRole("dialog").filter({ has: page.getByRole("button", { name: /規約を最下部までスクロールして確認|同意して次へ進む/ }) });

let fixture: PopupFixture;

test.beforeAll(async () => {
  fixture = await loadPopupFixture();
  await markOtherNoticesRead(fixture);
});

test.beforeEach(async ({ page }) => {
  await clearPopupNotices(fixture);
  // 前のテストが途中で失敗して未同意のまま残っていても、画面操作で同意し直してから始める
  await page.goto("/library");
  await agreeToPendingTerms(page);
});

test.afterEach(async () => {
  await clearPopupNotices(fixture);
});

test("規約が未同意の間はお知らせを出さず、同意後に表示する", async ({ page }) => {
  await createPopupNotices(fixture, 1);
  await resetTermsAgreement(fixture);

  await page.goto("/dashboard");
  await expect(termsDialog(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(noticeDialog(page)).toHaveCount(0);

  await agreeToPendingTerms(page);
  await expect(noticeDialog(page)).toBeVisible();
});

test("お知らせはダッシュボード以外では自動表示しない", async ({ page }) => {
  await createPopupNotices(fixture, 1);

  await page.goto("/library");
  await page.waitForLoadState("networkidle");
  await expect(noticeDialog(page)).toHaveCount(0);

  await navTab(page, "ホーム").click();
  await page.waitForURL("**/dashboard");
  await expect(noticeDialog(page)).toBeVisible();
});

test("途中で閉じると、表示したお知らせだけが既読になる", async ({ page }) => {
  const titles = await createPopupNotices(fixture, 2);

  await page.goto("/dashboard");
  const dialog = noticeDialog(page);
  await expect(dialog.getByText("1 / 2")).toBeVisible();
  const firstTitle = (await dialog.getByRole("heading").first().textContent())?.trim() ?? "";
  expect(titles).toContain(firstTitle);

  await dialog.getByRole("button", { name: "閉じる" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readNoticeTitles(fixture)).toEqual([firstTitle]);

  // 未表示だった残りの1件は、次回（再読み込み）に単独で表示される
  const remaining = titles.filter((t) => t !== firstTitle);
  await page.reload();
  await expect(dialog.getByRole("heading", { name: remaining[0] }).first()).toBeVisible();
  await expect(dialog.getByText("1 / 2")).toHaveCount(0);
});

test("最後まで確認するとすべて既読になり、再表示しない", async ({ page }) => {
  const titles = await createPopupNotices(fixture, 2);

  await page.goto("/dashboard");
  const dialog = noticeDialog(page);
  await dialog.getByRole("button", { name: "次のお知らせ" }).click();
  await dialog.getByRole("button", { name: "確認しました" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readNoticeTitles(fixture)).toEqual([...titles].sort());

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(noticeDialog(page)).toHaveCount(0);
});
