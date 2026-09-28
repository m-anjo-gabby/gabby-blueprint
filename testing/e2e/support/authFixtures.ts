import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../helpers/auth.ts";

/**
 * 認証まわり（パスワード再設定・招待）のE2E用の使い捨てデータ。
 *
 * - 固定アカウントのパスワードは変えられないため、再設定は都度作る使い捨ての生徒で検証する
 *   （命名は testing/FIXTURES.md の使い捨てデータの規則: `${TAG}-<用途>@gabby-qa-test.example`、顧客 `【QAテスト】…（${TAG}）`）。
 * - 使い捨ての生徒に対して「パスワード忘れ」を送信しない（`@gabby-qa-test.example` は実在しない宛先で、送信するとバウンスになる）。
 *   メールの受信まで確かめる場合だけ、Resend のテスト用アドレス（`delivered+<ラベル>@resend.dev`）を使う。
 * - 後始末は cleanupAuthFixture で必ず行う（テスト失敗時も afterAll で呼ぶ）。
 */

export const DISPOSABLE_EMAIL_DOMAIN = "gabby-qa-test.example";

export interface AuthFixture {
  admin: SupabaseClient;
  tag: string;
  clientId: string;
  userIds: string[];
  invitationEmails: string[];
}

export function newTag(prefix: string): string {
  // `qa` で始まらないこと（固定アカウントと区別するため）
  return `e2e${prefix}${Date.now()}`;
}

/** 使い捨ての顧客（テナント）を作る。招待・生徒はここに所属させ、固定テナントに影響させない */
export async function createAuthFixture(prefix: string): Promise<AuthFixture> {
  const admin = await createAdminClient();
  const tag = newTag(prefix);
  const { data, error } = await admin
    .from("com_m_client")
    .insert({ client_name: `【QAテスト】認証E2E（${tag}）`, client_type: 1, industry_type: 1 })
    .select("client_id")
    .single();
  if (error) throw new Error(`顧客の作成に失敗しました: ${error.message}`);
  return { admin, tag, clientId: data.client_id, userIds: [], invitationEmails: [] };
}

/** 使い捨ての生徒（ライセンスなし）を作る */
export async function createDisposableStudent(
  fixture: AuthFixture,
  params: { email: string; password: string; userName?: string }
): Promise<string> {
  const { data, error } = await fixture.admin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: { user_name: params.userName ?? `E2E生徒（${fixture.tag}）`, user_type: "1", client_id: fixture.clientId },
  });
  if (error || !data.user) throw new Error(`生徒の作成に失敗しました: ${error?.message}`);
  fixture.userIds.push(data.user.id);
  return data.user.id;
}

/** 招待（com_t_invitation）を直接作る。戻り値は招待トークン */
export async function createInvitation(
  fixture: AuthFixture,
  params: { email: string; userName: string; expiresAt: Date }
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const { error } = await fixture.admin.from("com_t_invitation").insert({
    email: params.email,
    user_name: params.userName,
    user_type: "1",
    client_id: fixture.clientId,
    token,
    expires_at: params.expiresAt.toISOString(),
  });
  if (error) throw new Error(`招待の作成に失敗しました: ${error.message}`);
  fixture.invitationEmails.push(params.email);
  return token;
}

async function findAuthUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`ユーザー一覧の取得に失敗しました: ${error.message}`);
    const user = data.users.find((u) => u.email === email);
    if (user) return user.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** 招待から本登録されたユーザーを後始末の対象に加える（本登録の成否もここで確かめる） */
export async function trackUserByEmail(fixture: AuthFixture, email: string): Promise<string | null> {
  const id = await findAuthUserIdByEmail(fixture.admin, email);
  if (id && !fixture.userIds.includes(id)) fixture.userIds.push(id);
  return id;
}

export async function cleanupAuthFixture(fixture: AuthFixture | undefined): Promise<void> {
  if (!fixture) return;
  const { admin } = fixture;
  if (fixture.invitationEmails.length > 0) {
    await admin.from("com_t_invitation").delete().in("email", fixture.invitationEmails);
  }
  for (const id of fixture.userIds) {
    await admin.from("com_t_user_role").delete().eq("user_id", id);
    await admin.from("com_m_user").delete().eq("id", id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.warn(`[authFixtures] ユーザー削除に失敗: ${id} ${error.message}`);
  }
  const { error } = await admin.from("com_m_client").delete().eq("client_id", fixture.clientId);
  if (error) console.warn(`[authFixtures] 顧客削除に失敗: ${fixture.clientId} ${error.message}`);
}

/** 再設定リンク（メール内のリンクと同じ形）を発行する。メールは送らない */
export async function generateRecoveryLinkPath(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) throw new Error(`再設定リンクの発行に失敗しました: ${error.message}`);
  return `/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery&next=/update-password`;
}
