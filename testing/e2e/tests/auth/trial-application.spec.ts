import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../../support/studentApp.ts";
import { createAdminClient } from "../../../helpers/auth.ts";
import { newTag } from "../../support/authFixtures.ts";
import { extractAppLinkPath, resendReadApiKey, resendTestAddress, waitForEmail } from "../../support/resendInbox.ts";

/**
 * Webトライアルの申込（公開画面 /trial）から本登録まで。
 * - 申込者は固定の顧客「Webトライアル」に所属するため、使い捨ての顧客ではなく、この申込で作られた行
 *   （申込・招待・通知・ユーザー・ライセンス・チケット、テスト中にできた月の契約）だけを後始末で消す。
 * - CAPTCHA は dev のテスト用の鍵（常に通る）で、ウィジェットのチェックは自動で完了する。
 * - 宛先は Resend のテスト用アドレス（実在しない宛先へ送らない）。受信を読む鍵が無い場合は、招待のトークンを DB から取る。
 */

const WEB_TRIAL_CLIENT_ID = "a7e1a100-0000-4000-8000-000000000001";
const PASSWORD = "TrialPass2026a";
const DAY_MS = 24 * 60 * 60 * 1000;

test.use({ storageState: { cookies: [], origins: [] } });

interface TrialFixture {
  admin: SupabaseClient;
  email: string;
  contractIdsBefore: Set<string>;
}

let fixture: TrialFixture | undefined;

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "申込フォームの画面操作は desktop だけで確かめる");
  const admin = await createAdminClient();
  const { data } = await admin.from("com_m_contract").select("contract_id").eq("client_id", WEB_TRIAL_CLIENT_ID);
  fixture = {
    admin,
    email: resendTestAddress(newTag("trial")),
    contractIdsBefore: new Set((data ?? []).map((c) => c.contract_id)),
  };
});

test.afterEach(async () => {
  if (!fixture) return;
  const { admin, email, contractIdsBefore } = fixture;
  const { data: app } = await admin.from("com_t_trial_application").select("application_id, user_id").eq("email", email).maybeSingle();
  if (app) {
    await admin.from("com_t_notification").delete().eq("notification_type", "TRIAL_APPLIED").like("dedup_key", `${app.application_id}:%`);
  }
  await admin.from("com_t_trial_application").delete().eq("email", email);
  await admin.from("com_t_invitation").delete().eq("email", email);
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email)?.id;
  if (userId) {
    for (const table of ["com_t_user_session_ticket_history", "com_t_user_session_ticket", "com_t_user_license_history", "com_t_user_license", "student_m_sprint_progress", "com_t_user_terms_agreement"]) {
      await admin.from(table).delete().eq("user_id", userId);
    }
    await admin.from("com_m_user").delete().eq("id", userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`[trial-application] ユーザー削除に失敗: ${userId} ${error.message}`);
  }
  // テスト中に作られた月の契約（その月の最初の本登録で作られる）だけを消す
  const { data: contracts } = await admin.from("com_m_contract").select("contract_id").eq("client_id", WEB_TRIAL_CLIENT_ID);
  const created = (contracts ?? []).map((c) => c.contract_id).filter((id) => !contractIdsBefore.has(id));
  if (created.length > 0) await admin.from("com_m_contract").delete().in("contract_id", created);
  fixture = undefined;
});

test("申込フォームから申し込み、届いた案内からパスワードを設定すると14日間のトライアルが始まる", async ({ page }) => {
  const { admin, email } = fixture!;
  const since = new Date();

  await page.goto("/trial");
  await expect(page.getByRole("heading", { name: "無料体験のお申し込み" })).toBeVisible();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("氏名").fill("E2Eトライアル");
  await page.getByLabel("姓（ローマ字）").fill("Shiken");
  await page.getByLabel("名（ローマ字）").fill("Trial");
  await page.getByRole("combobox", { name: /業種・職業/ }).click();
  await page.getByRole("option", { name: "その他" }).click();
  await page.getByLabel("業種・職業（その他）").fill("研究職");
  await page.getByLabel("国・都市").fill("Canada, Vancouver");
  await page.getByLabel("ご要望・ご質問").fill("E2Eの申込です");
  await page.getByRole("checkbox", { name: /個人情報保護方針/ }).check();
  // CAPTCHA（テスト用の鍵は自動で通る）のトークンが入ってから送る
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 30_000 });
  await page.getByRole("button", { name: "申し込む" }).click();
  await expect(page.getByRole("heading", { name: "お申し込みを受け付けました" })).toBeVisible({ timeout: 30_000 });

  const { data: app } = await admin
    .from("com_t_trial_application").select("application_id, occupation, occupation_other, timezone, invitation_id").eq("email", email).single();
  expect(app).toMatchObject({ occupation: 99, occupation_other: "研究職", timezone: "Asia/Tokyo" });
  const { data: invitation } = await admin.from("com_t_invitation").select("token, client_id, contract_id").eq("id", app!.invitation_id).single();
  expect(invitation).toMatchObject({ client_id: WEB_TRIAL_CLIENT_ID, contract_id: null });
  const { count: notified } = await admin
    .from("com_t_notification").select("notification_id", { count: "exact", head: true }).eq("notification_type", "TRIAL_APPLIED").like("dedup_key", `${app!.application_id}:%`);
  const { count: admins } = await admin.from("com_m_user").select("id", { count: "exact", head: true }).eq("user_type", "0").eq("delete_flg", "0");
  expect(notified).toBe(admins);

  // 届いた案内のリンク（受信を読めない環境では、同じリンクを招待のトークンから組み立てる）
  let invitePath = `/auth/invite?token=${invitation!.token}`;
  if (resendReadApiKey()) {
    const mail = await waitForEmail({ to: email, since, subject: /Webトライアルのお申し込みありがとうございます/ });
    invitePath = extractAppLinkPath(mail.html ?? "", "/auth/invite");
  }

  await page.goto(invitePath);
  await page.getByLabel("新しいパスワード", { exact: true }).fill(PASSWORD);
  await page.getByLabel("新しいパスワード（確認用）").fill(PASSWORD);
  await page.getByRole("button", { name: "本登録を完了する" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  const { data: registered } = await admin.from("com_t_trial_application").select("user_id, accepted_at").eq("email", email).single();
  expect(registered?.accepted_at).not.toBeNull();
  const { data: licenses } = await admin.from("com_t_user_license").select("license_id, start_date, end_date, contract_id").eq("user_id", registered!.user_id);
  expect(licenses).toHaveLength(1);
  const days = (Date.parse(licenses![0].end_date) + 1 - Date.parse(licenses![0].start_date)) / DAY_MS;
  expect(days).toBe(14);
  const { data: contract } = await admin.from("com_m_contract").select("client_id").eq("contract_id", licenses![0].contract_id).single();
  expect(contract?.client_id).toBe(WEB_TRIAL_CLIENT_ID);
  const { data: tickets } = await admin.from("com_t_user_session_ticket").select("total_sessions").eq("license_id", licenses![0].license_id);
  expect(tickets).toEqual([{ total_sessions: 1 }]);
});

test("必須の項目が空のままでは申し込めない", async ({ page }) => {
  await page.goto("/trial");
  await page.getByRole("button", { name: "申し込む" }).click();
  await expect(page.getByText("メールアドレスを入力してください")).toBeVisible();
  await expect(page.getByText("氏名を入力してください")).toBeVisible();
  await expect(page.getByText("業種・職業を選んでください")).toBeVisible();
  await expect(page.getByText("個人情報保護方針への同意が必要です")).toBeVisible();
  await expect(page.getByRole("link", { name: /個人情報保護方針/ })).toHaveAttribute("href", "https://gabbyacademy.com/privacy/");
  const { count } = await fixture!.admin.from("com_t_trial_application").select("application_id", { count: "exact", head: true }).eq("email", fixture!.email);
  expect(count).toBe(0);
});
