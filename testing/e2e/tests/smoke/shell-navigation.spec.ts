import { storageStatePath } from "../../support/personas.ts";
import { expect, navTab, test } from "../../support/studentApp.ts";

/**
 * スモーク: アプリシェルのナビゲーション（docs/screens/student/dashboard.md「アプリシェル」）。
 * 契約・ロールに応じたタブの出し分けと、配下画面でのアクティブ表示を確認する。
 * desktop / mobile の両プロジェクトで同じテストが動く（表示中のナビだけが取得される）。
 */

test.describe("ライブセッション契約の生徒", () => {
  test.use({ storageState: storageStatePath("liveStudent") });

  test("契約に応じたタブが表示され、ホームがアクティブになる", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(navTab(page, "ホーム")).toHaveAttribute("aria-current", "page");
    await expect(navTab(page, "学習")).toBeVisible();
    await expect(navTab(page, "ライブ")).toBeVisible();
    await expect(navTab(page, "チャット")).toBeVisible();
    await expect(navTab(page, "モニター")).toHaveCount(0);
  });

  test("ライブセッション配下の画面ではライブセッションタブがアクティブになる", async ({ page }) => {
    await page.goto("/calendar");

    await expect(page.getByRole("heading", { level: 1, name: "カレンダー" })).toBeVisible();
    await expect(navTab(page, "ライブ")).toHaveAttribute("aria-current", "page");
  });
});

test.describe("アプリのみ契約・モニターロールの生徒", () => {
  test.use({ storageState: storageStatePath("monitorStudent") });

  test("チャットタブは出ず、モニタータブが表示される", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(navTab(page, "ライブ")).toBeVisible();
    await expect(navTab(page, "モニター")).toBeVisible();
    await expect(navTab(page, "チャット")).toHaveCount(0);
  });

  test("ライブセッションタブではアップセルの紹介画面が表示される", async ({ page }) => {
    await page.goto("/live-room");

    await expect(navTab(page, "ライブ")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: /プラン・料金を見る/ })).toHaveAttribute(
      "href",
      "https://gabbyacademy.com/price"
    );
  });

  test("モニタータブからモニタリングダッシュボードを開ける", async ({ page }) => {
    await page.goto("/dashboard");
    await navTab(page, "モニター").click();

    await expect(page).toHaveURL(/\/monitor/);
    await expect(page.getByRole("heading", { level: 1, name: "モニタリングダッシュボード" })).toBeVisible();
    await expect(navTab(page, "モニター")).toHaveAttribute("aria-current", "page");
  });
});
