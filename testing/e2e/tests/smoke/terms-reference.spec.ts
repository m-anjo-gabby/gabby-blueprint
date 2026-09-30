import { storageStatePath } from "../../support/personas.ts";
import { expect, test } from "../../support/studentApp.ts";

/**
 * スモーク: ヘッダーのメニューからの規約の参照（docs/screens/student/dashboard.md「アプリシェル」）。
 * 参照用の最新の規約は、画面の表示時ではなく「利用規約」を開いた時に取得する（取得中はダイアログが読み込み中を表示する）。
 */

test.use({ storageState: storageStatePath("liveStudent") });

test("アカウントメニューの「利用規約」を開くと、その場で規約が読み込まれて表示される", async ({ page }) => {
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "アカウントメニュー" }).click();
  await page.getByRole("menuitem", { name: "利用規約" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // 読み込みが終わると、参照モードの見出しと案内文が表示される
  await expect(dialog.getByText("現在施行されている本サービスの各種規定をご確認いただけます。")).toBeVisible();
  await expect(dialog.getByText("読み込み中...")).toBeHidden();
});
