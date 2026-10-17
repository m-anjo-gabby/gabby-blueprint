import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../../support/studentApp.ts";
import { createAdminClient } from "../../../helpers/auth.ts";
import { newTag } from "../../support/authFixtures.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
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
  await page.getByLabel(/^姓\s*必須$/).fill("試験");
  await page.getByLabel(/^名\s*必須$/).fill("トライアル");
  await page.getByLabel("姓（ローマ字）").fill("Shiken");
  await page.getByLabel("名（ローマ字）").fill("Trial");
  await page.getByRole("combobox", { name: /業種・職業/ }).click();
  await page.getByRole("option", { name: "その他" }).click();
  await page.getByLabel("業種・職業（その他）").fill("研究職");
  await page.getByRole("combobox", { name: /Gabby をどこで知りましたか/ }).click();
  await page.getByRole("option", { name: "YouTube" }).click();
  await page.getByLabel("国・都市").fill("Canada, Vancouver");
  await page.getByLabel("ご要望・ご質問").fill("E2Eの申込です");
  await page.getByRole("checkbox", { name: /個人情報保護方針/ }).check();

  // 確認画面: 入力内容と、コーチに表示される名前（ローマ字の 名 姓）を見せる
  await page.getByRole("button", { name: "入力内容を確認する" }).click();
  await expect(page.getByRole("heading", { name: "入力内容のご確認" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("試験 トライアル")).toBeVisible();
  await expect(page.getByTestId("trial-coach-display-name")).toHaveText("Trial Shiken");
  // 「修正する」で入力内容を残したまま戻れる
  await page.getByRole("button", { name: "修正する" }).click();
  await expect(page.getByLabel("名（ローマ字）")).toHaveValue("Trial");
  await expect(page.getByRole("checkbox", { name: /個人情報保護方針/ })).toBeChecked();
  // ブラウザバックも「修正する」と同じ（確認画面へ進む時に履歴を1つ積む）
  await page.getByRole("button", { name: "入力内容を確認する" }).click();
  await expect(page.getByRole("heading", { name: "入力内容のご確認" })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("名（ローマ字）")).toHaveValue("Trial");
  await expect(page).toHaveURL(/\/trial$/);
  await page.getByRole("button", { name: "入力内容を確認する" }).click();

  // CAPTCHA（テスト用の鍵は自動で通る。確認画面に置く）のトークンが入ってから送る
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 30_000 });
  await page.getByRole("button", { name: "申し込む" }).click();
  await expect(page).toHaveURL(/\/trial\/complete$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "お申し込みを受け付けました" })).toBeVisible();
  // 再読み込みしても完了のまま。ブラウザバックでは確認画面に戻らず、空の入力画面になる（二重送信を防ぐ）
  await page.reload();
  await expect(page.getByRole("heading", { name: "お申し込みを受け付けました" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/trial$/);
  await expect(page.getByRole("button", { name: "入力内容を確認する" })).toBeVisible();
  await expect(page.getByLabel("名（ローマ字）")).toHaveValue("");

  const { data: app } = await admin
    .from("com_t_trial_application").select("application_id, occupation, occupation_other, referral_source, referral_source_other, timezone, invitation_id").eq("email", email).single();
  expect(app).toMatchObject({ occupation: 99, occupation_other: "研究職", referral_source: 3, referral_source_other: null, timezone: "Asia/Tokyo" });
  const { data: invitation } = await admin.from("com_t_invitation").select("token, user_name, client_id, contract_id").eq("id", app!.invitation_id).single();
  // 画面の名前（コーチも見る）はローマ字の「名 姓」
  expect(invitation).toMatchObject({ user_name: "Trial Shiken", client_id: WEB_TRIAL_CLIENT_ID, contract_id: null });
  const { count: notified } = await admin
    .from("com_t_notification").select("notification_id", { count: "exact", head: true }).eq("notification_type", "TRIAL_APPLIED").like("dedup_key", `${app!.application_id}:%`);
  const { count: admins } = await admin.from("com_m_user").select("id", { count: "exact", head: true }).eq("user_type", "0").eq("status", 1);
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
  // 申込の姓・名から正式な氏名を作る（ユーザーの削除で一緒に消える）
  const { data: user } = await admin.from("com_m_user").select("user_name").eq("id", registered!.user_id).single();
  expect(user?.user_name).toBe("Trial Shiken");
  const { data: legal } = await admin
    .from("com_m_user_legal").select("last_name, first_name, last_name_latin, first_name_latin, updated_by").eq("user_id", registered!.user_id).single();
  expect(legal).toEqual({ last_name: "試験", first_name: "トライアル", last_name_latin: "Shiken", first_name_latin: "Trial", updated_by: null });
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
  // 画面を開いた直後はハイドレーション前で押下が効かないことがあるため、エラーが出るまで押す
  await clickUntilVisible(page.getByRole("button", { name: "入力内容を確認する" }), page.getByText("メールアドレスを入力してください"));
  await expect(page.getByText("姓を入力してください", { exact: true })).toBeVisible();
  await expect(page.getByText("名を入力してください", { exact: true })).toBeVisible();
  await expect(page.getByText("業種・職業を選んでください")).toBeVisible();
  await expect(page.getByText("Gabby をどこで知ったかを選んでください")).toBeVisible();
  await expect(page.getByText("個人情報保護方針への同意が必要です")).toBeVisible();
  // 入力に誤りがあるうちは確認画面へ進まない
  await expect(page.getByRole("heading", { name: "入力内容のご確認" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /個人情報保護方針/ })).toHaveAttribute("href", "https://gabbyacademy.com/privacy/");
  const { count } = await fixture!.admin.from("com_t_trial_application").select("application_id", { count: "exact", head: true }).eq("email", fixture!.email);
  expect(count).toBe(0);
});
