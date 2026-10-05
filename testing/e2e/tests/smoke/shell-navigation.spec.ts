import { storageStatePath } from "../../support/personas.ts";
import { expect, navTab, test } from "../../support/studentApp.ts";

/**
 * スモーク: アプリシェルのナビゲーション（docs/screens/student/dashboard.md「アプリシェル」）。
 * 契約・ロールに応じたタブの出し分けと、配下画面でのアクティブ表示を確認する。
 * 全プロジェクト（desktop / mobile 等）で同じテストが動く（表示中のナビだけが取得される）。
 */

test.describe("ライブセッション契約の生徒", () => {
  test.use({ storageState: storageStatePath("liveStudent") });

  test("契約に応じたタブが表示され、ホームがアクティブになる", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(navTab(page, "ホーム")).toHaveAttribute("aria-current", "page");
    await expect(navTab(page, "トレーニング")).toBeVisible();
    await expect(navTab(page, "ライブ")).toBeVisible();
    await expect(navTab(page, "チャット")).toBeVisible();
    await expect(navTab(page, "モニター")).toHaveCount(0);
  });

  test("ライブセッション配下の画面ではライブセッションタブがアクティブになる", async ({ page }) => {
    await page.goto("/calendar");

    await expect(page.getByRole("heading", { level: 1, name: "カレンダー" })).toBeVisible();
    await expect(navTab(page, "ライブ")).toHaveAttribute("aria-current", "page");
  });

  test("トレーニング記録はナビ付きの画面として表示され、トレーニングタブがアクティブになる", async ({ page }) => {
    await page.goto("/training/performance");

    // 画面名は「トレーニング」の見出しと切り替えタブで示す（各画面の h1 は読み上げ用で見た目には出さない）
    await expect(page.getByRole("heading", { level: 1, name: "トレーニング記録" })).toBeAttached();
    await expect(
      page.getByRole("navigation", { name: "トレーニング" }).getByRole("link", { name: "トレーニング記録" })
    ).toHaveAttribute("aria-current", "page");
    await expect(navTab(page, "トレーニング")).toHaveAttribute("aria-current", "page");
  });
});

test.describe("アプリのみ契約・モニターロールの生徒", () => {
  test.use({ storageState: storageStatePath("monitorStudent") });

  test("ライブセッション・チャットのタブは出ず、モニタータブが表示される", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(navTab(page, "ホーム")).toBeVisible();
    await expect(navTab(page, "モニター")).toBeVisible();
    await expect(navTab(page, "ライブ")).toHaveCount(0);
    await expect(navTab(page, "チャット")).toHaveCount(0);
  });

  test("紹介画面（/live-room）には法人・個人の申し込み案内が併記され、戻るでホームへ戻る", async ({ page }) => {
    // ホームには紹介画面への導線を出さない（契約終了の案内からも削除済み）
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "ご契約プラン" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ライブセッション付きプランについて" })).toHaveCount(0);

    await page.goto("/live-room");
    await expect(page.getByRole("link", { name: "サポート窓口にメールで相談する" })).toHaveAttribute(
      "href",
      /^mailto:support@gabbyacademy\.com\?subject=/
    );
    await expect(page.getByRole("link", { name: /個人向けプラン・料金を見る/ })).toHaveAttribute(
      "href",
      "https://gabbyacademy.com/price"
    );

    await page.getByRole("link", { name: "戻る" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("モニタータブからモニタリングダッシュボードを開ける", async ({ page }) => {
    await page.goto("/dashboard");
    await navTab(page, "モニター").click();

    await expect(page).toHaveURL(/\/monitor/);
    await expect(page.getByRole("heading", { level: 1, name: "モニタリングダッシュボード" })).toBeVisible();
    await expect(navTab(page, "モニター")).toHaveAttribute("aria-current", "page");
  });
});
