import { test, expect } from "../../support/studentApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableContract,
  createInvitation,
  trackUserByEmail,
  type AuthFixture,
} from "../../support/authFixtures.ts";

/**
 * 招待からの本登録（仕様: e2e/specs/auth/password-reset-and-invite.md、画面: docs/screens/common/invite.md）
 * 招待は使い捨ての顧客に紐づけて直接作る（招待メールの送信は admin の画面操作で、このE2Eの対象外）。
 */

const PASSWORD = "InvitePass2026a";
const DAY_MS = 24 * 60 * 60 * 1000;

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;

test.beforeEach(async () => {
  fixture = await createAuthFixture("invite");
});

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

test("招待リンクからパスワードを設定して本登録できる（同じリンクは再利用できない）", async ({ page }) => {
  const email = `${fixture!.tag}-invite@${DISPOSABLE_EMAIL_DOMAIN}`;
  const userName = `E2E招待（${fixture!.tag}）`;
  const token = await createInvitation(fixture!, { email, userName, expiresAt: new Date(Date.now() + 3 * DAY_MS) });

  await page.goto(`/auth/invite?token=${token}`);
  await expect(page.getByRole("heading", { name: "アカウント初期設定" })).toBeVisible();
  await expect(page.getByText(`${userName} 様（${email}）`)).toBeVisible();

  await page.getByLabel("新しいパスワード", { exact: true }).fill(PASSWORD);
  await page.getByLabel("新しいパスワード（確認用）").fill(PASSWORD);
  await page.getByRole("button", { name: "本登録を完了する" }).click();

  // 契約の無い招待のため、本登録後の自動ログインはライセンス確認で止まる（アカウントは作成済み）
  await expect(page.getByRole("alert").filter({ hasText: "有効なライセンスが見つかりません。" })).toBeVisible();
  expect(await trackUserByEmail(fixture!, email)).not.toBeNull();
  const { data: invitation } = await fixture!.admin.from("com_t_invitation").select("accepted_at").eq("email", email).single();
  expect(invitation?.accepted_at).not.toBeNull();

  await page.goto(`/auth/invite?token=${token}`);
  await expect(page.getByRole("heading", { name: "招待リンクを確認できませんでした" })).toBeVisible();
  await expect(page.getByText("この招待リンクは無効か、すでに本登録が完了しています。")).toBeVisible();
});

test("ライブ付き契約の招待から本登録すると、契約管理からの割当と同じくチケット・履歴付きのライセンスが付く", async ({ page }) => {
  // ダイアログプラクティス提供ありのライブプラン（ジャーニー: e2e/journeys/new-customer-onboarding.md 手順5）
  const { contractId } = await createDisposableContract(fixture!, { planCode: "LIVE_WEEKLY2_3M", label: "live" });
  const email = `${fixture!.tag}-live@${DISPOSABLE_EMAIL_DOMAIN}`;
  const token = await createInvitation(fixture!, { email, userName: `E2Eライブ（${fixture!.tag}）`, expiresAt: new Date(Date.now() + 3 * DAY_MS), contractId });

  await page.goto(`/auth/invite?token=${token}`);
  await page.getByLabel("新しいパスワード", { exact: true }).fill(PASSWORD);
  await page.getByLabel("新しいパスワード（確認用）").fill(PASSWORD);
  await page.getByRole("button", { name: "本登録を完了する" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const userId = await trackUserByEmail(fixture!, email);
  expect(userId).not.toBeNull();
  const { admin } = fixture!;
  const { data: license } = await admin
    .from("com_t_user_license").select("license_id, has_dialogue_practice").eq("user_id", userId!).eq("contract_id", contractId).single();
  expect(license?.has_dialogue_practice).toBe(true);
  const { data: tickets } = await admin
    .from("com_t_user_session_ticket").select("weekly_frequency, total_sessions, used_sessions").eq("license_id", license!.license_id);
  expect(tickets).toEqual([{ weekly_frequency: 2, total_sessions: 24, used_sessions: 0 }]);
  const { count: licenseHistory } = await admin
    .from("com_t_user_license_history").select("license_id", { count: "exact", head: true }).eq("license_id", license!.license_id).eq("action", "assigned");
  expect(licenseHistory).toBe(1);
  const { count: ticketHistory } = await admin
    .from("com_t_user_session_ticket_history").select("ticket_id", { count: "exact", head: true }).eq("user_id", userId!).eq("action", "granted");
  expect(ticketHistory).toBe(1);
});

test("有効期限を過ぎた招待リンクは期限切れと表示される", async ({ page }) => {
  const email = `${fixture!.tag}-expired@${DISPOSABLE_EMAIL_DOMAIN}`;
  const token = await createInvitation(fixture!, { email, userName: "E2E期限切れ", expiresAt: new Date(Date.now() - DAY_MS) });

  await page.goto(`/auth/invite?token=${token}`);
  await expect(page.getByRole("heading", { name: "招待リンクの期限切れ" })).toBeVisible();
  await expect(page.getByText("招待リンクの有効期限が切れています。管理者に再送を依頼してください。")).toBeVisible();
  await expect(page.getByRole("link", { name: "ログイン画面に戻る" })).toBeVisible();
});

test("存在しない招待トークンは確認できないと表示される", async ({ page }) => {
  await page.goto(`/auth/invite?token=e2e-invalid-${fixture!.tag}`);
  await expect(page.getByRole("heading", { name: "招待リンクを確認できませんでした" })).toBeVisible();
});
