import { test, expect } from "../../support/studentApp.ts";
import { signInAsRole } from "../../../helpers/auth.ts";
import { storageStatePath } from "../../support/personas.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  generateRecoveryLinkPath,
  grantAppLicense,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { extractAppLinkPath, resendReadApiKey, resendTestAddress, waitForEmail } from "../../support/resendInbox.ts";

/**
 * パスワード再設定（仕様: e2e/specs/auth/password-reset-and-invite.md、画面: docs/screens/common/password-reset.md）
 * 固定アカウントのパスワードは変えられないため、使い捨ての生徒で検証する（support/authFixtures.ts）。
 */

const INITIAL_PASSWORD = "InitPass2026a";
const NEW_PASSWORD = "NewPass2026b";

const heading = (page: import("@playwright/test").Page, name: string) => page.getByRole("heading", { name });
const alertWith = (page: import("@playwright/test").Page, text: string) => page.getByRole("alert").filter({ hasText: text });

test.describe("再設定リンクからの設定（未ログイン）", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let fixture: AuthFixture | undefined;
  let email: string;
  let userId: string;

  test.beforeEach(async () => {
    fixture = await createAuthFixture("reset");
    email = `${fixture.tag}-reset@${DISPOSABLE_EMAIL_DOMAIN}`;
    userId = await createDisposableStudent(fixture, { email, password: INITIAL_PASSWORD });
    // 完了後にダッシュボード（ライセンス必須）まで進むため、アプリのみ契約のライセンスを付ける
    await grantAppLicense(fixture, userId);
  });

  test.afterEach(async () => {
    await cleanupAuthFixture(fixture);
    fixture = undefined;
  });

  test("リンクを確認してから新しいパスワードを設定でき、完了後はそのままダッシュボードへ移る", async ({ page }) => {
    // 別の端末でログイン中のセッション（再設定の完了でログアウトされる）と、ログイン失敗によるロック中の状態を用意する
    const otherDevice = await signInAsRole(email, INITIAL_PASSWORD);
    await fixture!.admin
      .from("com_m_user")
      .update({ login_failed_count: 10, locked_until: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
      .eq("id", userId);

    await page.goto(await generateRecoveryLinkPath(fixture!.admin, email));

    // メールソフトの事前読み込みでトークンを消費しないよう、表示しただけでは確認しない
    await expect(heading(page, "パスワードの再設定")).toBeVisible();
    await page.getByRole("button", { name: "手続きを開始する" }).click();
    await expect(heading(page, "新しいパスワードの設定")).toBeVisible();
    await expect(page).toHaveURL(/\/update-password$/);

    // 確認後に再読み込みしてもフォームのまま（確認済みのセッション）
    await page.reload();
    await expect(heading(page, "新しいパスワードの設定")).toBeVisible();

    const newPassword = page.getByLabel("新しいパスワード", { exact: true });
    const confirmPassword = page.getByLabel("新しいパスワード（確認用）");
    const submit = page.getByRole("button", { name: "パスワードを更新してログイン" });

    // 入力中の警告（送信前のチェックと同じ文言）
    await newPassword.fill("abcdefgh");
    await expect(page.getByText("パスワードには英字と数字を両方含めてください。")).toBeVisible();
    await confirmPassword.fill("abcdefgh");
    await submit.click();
    await expect(alertWith(page, "パスワードには英字と数字を両方含めてください。")).toBeVisible();

    await newPassword.fill(NEW_PASSWORD);
    await confirmPassword.fill(`${NEW_PASSWORD}x`);
    await expect(page.getByText("パスワードが一致していません")).toBeVisible();
    await submit.click();
    await expect(alertWith(page, "パスワードが一致していません")).toBeVisible();

    await confirmPassword.fill(NEW_PASSWORD);
    await expect(page.getByText("パスワードが一致しました")).toBeVisible();
    await submit.click();
    await expect(heading(page, "パスワードを更新しました")).toBeVisible();

    // この端末はログインしたまま、ダッシュボードへ移る
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("main")).toBeVisible();

    // 他の端末はログアウトされ、ロックは解除され、パスワードは新しいものに変わっている
    const { error: otherDeviceError } = await otherDevice.auth.getUser();
    expect(otherDeviceError).not.toBeNull();
    const { data: lock } = await fixture!.admin.from("com_m_user").select("login_failed_count, locked_until").eq("id", userId).single();
    expect(lock).toEqual({ login_failed_count: 0, locked_until: null });
    await signInAsRole(email, NEW_PASSWORD);
    await expect(signInAsRole(email, INITIAL_PASSWORD)).rejects.toThrow();

    // 確認済みの印は消えているため、再設定画面を開き直してもフォームは出ない（以後の変更は現在のパスワード確認が必要）
    await page.goto("/update-password");
    await expect(heading(page, "再設定リンクを確認できませんでした")).toBeVisible();
  });

  test("使用済みの再設定リンクはもう一度使えない", async ({ page }) => {
    const linkPath = await generateRecoveryLinkPath(fixture!.admin, email);
    await page.goto(linkPath);
    await page.getByRole("button", { name: "手続きを開始する" }).click();
    await expect(heading(page, "新しいパスワードの設定")).toBeVisible();

    await page.context().clearCookies();
    await page.goto(linkPath);
    await page.getByRole("button", { name: "手続きを開始する" }).click();
    await expect(heading(page, "再設定リンクを確認できませんでした")).toBeVisible();
    await expect(page.getByRole("link", { name: "再設定メールを送信する" })).toHaveAttribute("href", "/forgot-password");
  });
});

test.describe("再設定画面の直接表示（ログイン中）", () => {
  // 固定アカウントは閲覧のみ（状態を変えない）
  test.use({ storageState: storageStatePath("liveStudent") });

  test("ログイン中でも、再設定リンクを経由しなければフォームを表示しない", async ({ page }) => {
    await page.goto("/update-password");
    await expect(heading(page, "再設定リンクを確認できませんでした")).toBeVisible();
    await expect(page.getByLabel("新しいパスワード", { exact: true })).toHaveCount(0);
  });
});

test.describe("パスワード忘れ（未ログイン）", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("未登録のメールアドレスでも完了画面になる（登録の有無を判別させない）", async ({ page }) => {
    await page.goto("/forgot-password");
    // 未登録のためメールは送られない
    await page.getByLabel("メールアドレス").fill(`e2e-unregistered-${Date.now()}@${DISPOSABLE_EMAIL_DOMAIN}`);
    await page.getByRole("button", { name: "送信する" }).click();
    await expect(heading(page, "メールを確認してください")).toBeVisible();
    await expect(page.getByRole("link", { name: "ログイン画面に戻る" })).toBeVisible();
  });
});

test.describe("再設定メールの受信（Resend）", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let fixture: AuthFixture | undefined;

  test.afterEach(async () => {
    await cleanupAuthFixture(fixture);
    fixture = undefined;
  });

  test("パスワード忘れから届いたメールのリンクで、再設定を始められる", async ({ page }, testInfo) => {
    test.skip(!resendReadApiKey(), "RESEND_TEST_READ_API_KEY（読み取り可能なキー）が未設定");
    // 実際にメールを送るため、端末の違いを見る必要のない desktop だけで行う
    test.skip(testInfo.project.name !== "desktop", "メール送信は desktop のみ");

    fixture = await createAuthFixture("mail");
    const email = resendTestAddress(`${fixture.tag}-reset`);
    await createDisposableStudent(fixture, { email, password: INITIAL_PASSWORD });

    const since = new Date();
    await page.goto("/forgot-password");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByRole("button", { name: "送信する" }).click();
    await expect(heading(page, "メールを確認してください")).toBeVisible();

    const mail = await waitForEmail({ to: email, since });
    expect(mail.subject).toBe("【Gabby Blueprint】パスワード再設定手続きのご案内");
    expect(mail.html).toContain("30分間");

    await page.goto(extractAppLinkPath(mail.html ?? "", "/auth/callback"));
    await expect(heading(page, "パスワードの再設定")).toBeVisible();
    await page.getByRole("button", { name: "手続きを開始する" }).click();
    await expect(heading(page, "新しいパスワードの設定")).toBeVisible();
  });
});
