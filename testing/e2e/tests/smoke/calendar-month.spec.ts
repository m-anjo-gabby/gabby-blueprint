import { storageStatePath } from "../../support/personas.ts";
import { expect, test } from "../../support/studentApp.ts";

/**
 * スモーク: カレンダーの月切替（docs/screens/student/calendar.md）。
 * 表示月は URL の ?month=YYYY-MM で持ち、月送りでページ遷移してサーバーで取り直す。
 * 月の予定の有無はデータ次第のため、ここでは表示月・URL・日付の枠（曜日と日付）だけを確認する。
 */

test.use({ storageState: storageStatePath("liveStudent") });

const monthLabel = (page: import("@playwright/test").Page) => page.getByRole("main").getByText(/^\d{4}年\d{1,2}月$/);

test("?month= で指定した月を表示し、月送りで URL と表示月が切り替わる", async ({ page }) => {
  await page.goto("/calendar?month=2026-10");

  await expect(page.getByRole("heading", { level: 1, name: "カレンダー" })).toBeVisible();
  await expect(monthLabel(page)).toHaveText("2026年10月");

  await page.getByRole("button", { name: "前の月" }).click();
  await expect(page).toHaveURL(/\/calendar\?month=2026-09$/);
  await expect(monthLabel(page)).toHaveText("2026年9月");

  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page).toHaveURL(/\/calendar\?month=2026-10$/);
  await expect(monthLabel(page)).toHaveText("2026年10月");
});

test("不正な ?month= は今月として表示する", async ({ page }) => {
  await page.goto("/calendar?month=2026-13");
  await expect(page.getByRole("heading", { level: 1, name: "カレンダー" })).toBeVisible();
  await expect(monthLabel(page)).toHaveText(/^\d{4}年\d{1,2}月$/);
  await expect(monthLabel(page)).not.toHaveText("2026年13月");
});
