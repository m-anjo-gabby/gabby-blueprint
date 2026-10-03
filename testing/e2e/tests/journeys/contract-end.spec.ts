import type { Page } from "@playwright/test";
import { test, expect, loginAsNewStudent } from "../../support/studentApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  grantAppLicense,
  type AuthFixture,
} from "../../support/authFixtures.ts";

/**
 * 契約の終了・停止（アプリのみ契約）（ジャーニー: e2e/journeys/contract-end.md）
 * - 終了日の14日前から、ホームのご契約プランに継続の案内が出る
 * - ログイン中にライセンスが停止されると、次の画面の表示でログイン画面へ戻される
 * - 期間が終わった（または停止された）生徒はログインできず、案内が出る
 * データはすべて使い捨て。停止はアドミンの無効化（invalidate_user_license）と同じく status=0 にする
 * （アプリのみ契約はチケットが無いため、ライセンスの更新だけで同じ状態になる）。
 */

const PASSWORD = "ContractEnd2026a";
const DAY_MS = 24 * 60 * 60 * 1000;
const NO_LICENSE_MESSAGE = "有効なライセンスが見つかりません。管理者にお問い合わせください。";

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** 使い捨てのアプリのみ契約の生徒（ライセンス期間を指定） */
async function createStudent(prefix: string, period: { start: Date; end: Date }): Promise<{ f: AuthFixture; email: string; userId: string }> {
  const f = await createAuthFixture(prefix);
  fixture = f;
  const email = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const userId = await createDisposableStudent(f, { email, password: PASSWORD });
  await grantAppLicense(f, userId, period);
  return { f, email, userId };
}

async function tryLogin(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.locator("input[name=password]").press("Enter");
}

test("終了日の14日前から、ホームのご契約プランに継続の案内が出る（ステップ1）", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");

  const now = Date.now();
  const { email } = await createStudent("cend", { start: new Date(now - 30 * DAY_MS), end: new Date(now + 10 * DAY_MS) });
  await loginAsNewStudent(page, email, PASSWORD);

  await expect(page.getByText(/でご契約が終了します$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "料金・お申し込みを見る" })).toBeVisible();
  await expect(page.getByRole("link", { name: "サポート窓口に相談する" })).toBeVisible();
});

test("ログイン中にライセンスが停止されると、次の画面でログイン画面へ戻り、以後ログインできない（ステップ6〜7）", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");

  const now = Date.now();
  const { f, email, userId } = await createStudent("cstop", { start: new Date(now - DAY_MS), end: new Date(now + 30 * DAY_MS) });
  await loginAsNewStudent(page, email, PASSWORD);

  const { error } = await f.admin.from("com_t_user_license").update({ status: 0 }).eq("user_id", userId);
  if (error) throw new Error(`ライセンスの停止に失敗しました: ${error.message}`);

  await page.goto("/library");
  await page.waitForURL("**/login**");

  await tryLogin(page, email);
  await expect(page.getByText(NO_LICENSE_MESSAGE)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("期間が終わった生徒はログインできず、案内が出る（ステップ3）", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");

  const now = Date.now();
  const { email } = await createStudent("cexp", { start: new Date(now - 40 * DAY_MS), end: new Date(now - DAY_MS) });

  await tryLogin(page, email);
  await expect(page.getByText(NO_LICENSE_MESSAGE)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
