import { test, expect } from "../../support/studentApp.ts";
import { DISPOSABLE_EMAIL_DOMAIN } from "../../support/authFixtures.ts";

/**
 * ログイン画面の案内・エラー（画面: docs/screens/student/login.md）
 * 固定アカウントの失敗回数を増やさないよう、認証失敗は未登録のメールアドレスで確かめる。
 */

test.use({ storageState: { cookies: [], origins: [] } });

test("認証に失敗するとエラーを表示し、パスワード欄だけを空にする", async ({ page }) => {
  const email = `e2e-unregistered-${Date.now()}@${DISPOSABLE_EMAIL_DOMAIN}`;
  await page.goto("/login");
  // 制御コンポーネントのため、ハイドレーション後に入力する（KJ-2026-0928-02）
  await expect(page.locator("form[data-ready='true']")).toBeVisible();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("WrongPass2026a");
  await page.getByRole("button", { name: "ログイン" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "認証情報が正しくありません。" })).toBeVisible();
  await expect(page.getByLabel("パスワード")).toHaveValue("");
  await expect(page.getByLabel("メールアドレス")).toHaveValue(email);
});

test("パスワード再設定の完了後は、更新済みの案内を表示する", async ({ page }) => {
  await page.goto("/login?message=updated");
  await expect(page.getByText("パスワードを更新しました。新しいパスワードでログインしてください。")).toBeVisible();
});

test("認証用リンクの確認に失敗して戻った場合は、リンクのエラーを案内する", async ({ page }) => {
  await page.goto("/login?error=auth");
  await expect(page.getByText("リンクを確認できませんでした。もう一度お試しいただくか、管理者にお問い合わせください。")).toBeVisible();
});

test("認証用リンクの戻り先に外部サイトを指定しても、外部へは移らない", async ({ page }) => {
  const response = await page.request.get("/auth/callback?next=@evil.example", { maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(response.headers()["location"]).not.toContain("evil");
});
