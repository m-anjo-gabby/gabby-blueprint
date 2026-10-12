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
  /** 顧客を画面操作で作るテスト（ジャーニー）では、作成後に設定する。未設定（空文字）なら顧客の後始末をしない */
  clientId: string;
  userIds: string[];
  invitationEmails: string[];
}

export function newTag(prefix: string): string {
  // `qa` で始まらないこと（固定アカウントと区別するため）。接頭辞は英小文字だけにする（残骸の確認 authFixtures.leftovers.ts が `e2e<英小文字><数字>-` で探す）
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

/**
 * 使い捨ての顧客に、プランマスタの値どおりの契約を作る（期間の既定は昨日〜30日後）。
 * 使い捨ての顧客に作るため、固定テナントの契約・ライセンス数には影響しない。
 */
export async function createDisposableContract(
  fixture: AuthFixture,
  params: { planCode: string; label: string; maxLicenses?: number; start?: Date; end?: Date }
): Promise<{ contractId: string; start: Date; end: Date }> {
  const { admin } = fixture;
  const { data: plan, error: planError } = await admin.from("com_m_contract_plan").select("*").eq("plan_code", params.planCode).single();
  if (planError) throw new Error(`契約プランの取得に失敗しました: ${planError.message}`);

  const start = params.start ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = params.end ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const { data: contract, error: contractError } = await admin
    .from("com_m_contract")
    .insert({
      client_id: fixture.clientId,
      plan_id: plan.plan_id,
      plan_name: plan.plan_name,
      contract_name: `【QAテスト】認証E2E（${fixture.tag}）${params.label}`,
      plan_name_en: plan.plan_name_en,
      contract_type: plan.contract_type,
      weekly_frequency: plan.weekly_frequency,
      total_sessions: plan.total_sessions,
      has_dialogue_practice: plan.has_dialogue_practice,
      max_licenses: params.maxLicenses ?? 1,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      status: 1,
      note: `【QAテスト】認証E2E（${fixture.tag}）`,
    })
    .select("contract_id")
    .single();
  if (contractError) throw new Error(`契約の作成に失敗しました: ${contractError.message}`);
  return { contractId: contract.contract_id, start, end };
}

/**
 * 使い捨ての生徒に、アプリのみ契約（BLUEPRINT_ONLY）のライセンスを付ける（ログイン後の画面まで確かめる場合）。
 * 本登録時の初期ライセンスと同じく、スプリントのレベル管理をオフにする。期間の既定は昨日〜30日後。
 */
export async function grantAppLicense(fixture: AuthFixture, userId: string, period?: { start: Date; end: Date }): Promise<void> {
  const { admin } = fixture;
  const { contractId, start, end } = await createDisposableContract(fixture, { planCode: "BLUEPRINT_ONLY", label: userId.slice(0, 8), ...period });

  // ライセンスの追加で auth.users の app_metadata.is_licensed が更新される（トリガー）
  const { error: licenseError } = await admin.from("com_t_user_license").insert({
    contract_id: contractId,
    user_id: userId,
    status: 1,
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  });
  if (licenseError) throw new Error(`ライセンスの付与に失敗しました: ${licenseError.message}`);

  // アプリの初期ライセンス発行（packages/lib/license/issue.ts）と同じく、アプリのみ契約はスプリントのレベル管理をしない
  const { error: progressError } = await admin.from("student_m_sprint_progress").update({ level_managed: false }).eq("user_id", userId);
  if (progressError) throw new Error(`レベル管理の設定に失敗しました: ${progressError.message}`);
}

/**
 * 使い捨ての生徒に、ライブ付き契約のライセンスとチケットを付ける（期間を指定。現在・次の契約を作り分ける場合）。
 * アプリの割当と同じく、ダイアログプラクティス提供有無を契約からコピーし、チケットはプランの回数で作る。
 */
export async function grantLiveLicense(
  fixture: AuthFixture,
  userId: string,
  params: { planCode: string; label: string; start: Date; end: Date }
): Promise<{ ticketId: string }> {
  const { admin } = fixture;
  const { contractId } = await createDisposableContract(fixture, params);
  const { data: contract } = await admin
    .from("com_m_contract").select("weekly_frequency, total_sessions, has_dialogue_practice").eq("contract_id", contractId).single();
  const { data: license, error: licenseError } = await admin
    .from("com_t_user_license")
    .insert({
      contract_id: contractId,
      user_id: userId,
      status: 1,
      start_date: params.start.toISOString(),
      end_date: params.end.toISOString(),
      has_dialogue_practice: contract!.has_dialogue_practice,
    })
    .select("license_id")
    .single();
  if (licenseError) throw new Error(`ライセンスの付与に失敗しました: ${licenseError.message}`);
  const { data: ticket, error: ticketError } = await admin
    .from("com_t_user_session_ticket")
    .insert({
      license_id: license.license_id,
      contract_id: contractId,
      user_id: userId,
      weekly_frequency: contract!.weekly_frequency,
      total_sessions: contract!.total_sessions,
    })
    .select("ticket_id")
    .single();
  if (ticketError) throw new Error(`チケットの発行に失敗しました: ${ticketError.message}`);
  return { ticketId: ticket.ticket_id };
}

/**
 * 使い捨てのコーチを作る（コーチのプロフィールはユーザー作成時のトリガーで作られる）。
 * 空き時間（`com_m_coach_availability`）は UTC の曜日（0=日〜6=土）・時刻で渡す。生徒の「専属コーチを探す」に表示され、申請を受けられる。
 */
export async function createDisposableCoach(
  fixture: AuthFixture,
  params: {
    email: string;
    password: string;
    userName: string;
    timezone: string;
    availability: { dayOfWeek: number; startTime: string; endTime: string }[];
  }
): Promise<string> {
  const { admin } = fixture;
  const { data, error } = await admin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: { user_name: params.userName, user_type: "2" },
  });
  if (error || !data.user) throw new Error(`コーチの作成に失敗しました: ${error?.message}`);
  const coachId = data.user.id;
  fixture.userIds.push(coachId);
  await admin.from("com_m_user").update({ timezone: params.timezone }).eq("id", coachId);
  if (params.availability.length > 0) {
    const { error: availabilityError } = await admin.from("com_m_coach_availability").insert(
      params.availability.map((a) => ({ coach_id: coachId, day_of_week: a.dayOfWeek, start_time: a.startTime, end_time: a.endTime }))
    );
    if (availabilityError) throw new Error(`空き時間の登録に失敗しました: ${availabilityError.message}`);
  }
  return coachId;
}

/**
 * 使い捨てのユーザーが参加するチャットルームを消す（マッチングの成立時に生徒×コーチの1対1のルームが作られ、
 * ユーザーの削除ではルーム自体は消えない）。cleanupAuthFixture の前に呼ぶ。
 */
export async function deleteFixtureChatRooms(fixture: AuthFixture | undefined): Promise<void> {
  if (!fixture || fixture.userIds.length === 0) return;
  const { data: rooms } = await fixture.admin.from("com_t_chat_room_user").select("room_id").in("user_id", fixture.userIds);
  const roomIds = Array.from(new Set((rooms ?? []).map((r) => r.room_id)));
  if (roomIds.length > 0) await fixture.admin.from("com_t_chat_room").delete().in("room_id", roomIds);
}

/**
 * 使い捨ての顧客の生徒が使える教材（種別: 0=単語帳 / 2=スプリント / 3=ダイアログ）を1つ用意する。共通公開を優先し、無ければ限定公開の教材
 * （顧客専用の「[…]」で始まる名前を除く）を使い捨ての顧客に公開する（環境によって同じ教材の公開範囲が違うため。公開先は cleanupAuthFixture で消える）。
 * `contentIds` を渡すと、その中から選ぶ（例: コーチ用スライドのあるダイアログ教材だけ）。
 */
export async function prepareContent(
  fixture: AuthFixture,
  contentType: 0 | 2 | 3,
  contentIds?: string[]
): Promise<{ content_id: string; content_name: string }> {
  let query = fixture.admin
    .from("com_m_contents")
    .select("content_id, content_name, content_scope")
    .eq("content_type", contentType)
    .in("content_scope", [0, 1])
    .eq("delete_flg", "0")
    .not("content_name", "like", "[%");
  if (contentIds) query = query.in("content_id", contentIds);
  const { data, error } = await query.order("content_scope").order("content_name").limit(1).single();
  if (error || !data) throw new Error(`教材（種別 ${contentType}）が見つかりません: ${error?.message}`);
  if (data.content_scope === 1) {
    const { error: accessError } = await fixture.admin.from("com_m_contents_access").insert({ client_id: fixture.clientId, content_id: data.content_id });
    if (accessError) throw new Error(`教材の公開先の追加に失敗しました: ${accessError.message}`);
  }
  return { content_id: data.content_id, content_name: data.content_name };
}

/** 使い捨ての顧客の生徒が使える単語帳を1つ用意する（prepareContent） */
export async function prepareWordContent(fixture: AuthFixture): Promise<{ content_id: string; content_name: string }> {
  return prepareContent(fixture, 0);
}

/** 招待（com_t_invitation）を直接作る。contractId を渡すと、本登録時にその契約の初期ライセンスが付く。戻り値は招待トークン */
export async function createInvitation(
  fixture: AuthFixture,
  params: { email: string; userName: string; expiresAt: Date; contractId?: string }
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const { error } = await fixture.admin.from("com_t_invitation").insert({
    email: params.email,
    user_name: params.userName,
    user_type: "1",
    client_id: fixture.clientId,
    contract_id: params.contractId ?? null,
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
  if (!fixture.clientId) {
    await deleteUsers(fixture);
    return;
  }
  // 顧客に付けた教材の公開先（画面操作で割り当てた場合）
  await admin.from("com_m_contents_access").delete().eq("client_id", fixture.clientId);
  // 使い捨て顧客の契約・ライセンス・ライブのチケット（grantAppLicense・createDisposableContract）
  const { data: contracts } = await admin.from("com_m_contract").select("contract_id").eq("client_id", fixture.clientId);
  const contractIds = (contracts ?? []).map((c) => c.contract_id);
  if (contractIds.length > 0) {
    // チケットの担当枠（マッチングの成立・直接作成）を先に消す。セッションは担当枠と一緒に消える
    // （com_t_session.ticket_id は削除で連動しないため、残るとチケット以降を消せない。KJ-2026-1006-01）
    const { data: tickets } = await admin.from("com_t_user_session_ticket").select("ticket_id").in("contract_id", contractIds);
    const ticketIds = (tickets ?? []).map((t) => t.ticket_id);
    if (ticketIds.length > 0) await admin.from("com_m_lesson_schedule").delete().in("ticket_id", ticketIds);
    await admin.from("com_t_user_session_ticket_history").delete().in("contract_id", contractIds);
    await admin.from("com_t_user_session_ticket").delete().in("contract_id", contractIds);
    await admin.from("com_t_user_license_history").delete().in("contract_id", contractIds);
    await admin.from("com_t_user_license").delete().in("contract_id", contractIds);
    await admin.from("com_m_contract").delete().in("contract_id", contractIds);
  }
  await deleteUsers(fixture);
  const { error } = await admin.from("com_m_client").delete().eq("client_id", fixture.clientId);
  if (error) console.warn(`[authFixtures] 顧客削除に失敗: ${fixture.clientId} ${error.message}`);
}

async function deleteUsers(fixture: AuthFixture): Promise<void> {
  const { admin } = fixture;
  for (const id of fixture.userIds) {
    // コーチが割り当てたダイアログ教材（進捗・セッションでの教材オープンの記録も連動して消える）
    await admin.from("com_t_dialogue_assignment").delete().eq("student_id", id);
    // 担当枠を作ったテストでは、トリガーで担当関係が作られる（固定コーチとの関係も残さない）
    await admin.from("com_m_coach_student_relationship").delete().eq("student_id", id);
    await admin.from("com_t_user_role").delete().eq("user_id", id);
    await admin.from("com_m_user").delete().eq("id", id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.warn(`[authFixtures] ユーザー削除に失敗: ${id} ${error.message}`);
  }
}

/** 再設定リンク（メール内のリンクと同じ形）を発行する。メールは送らない */
export async function generateRecoveryLinkPath(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) throw new Error(`再設定リンクの発行に失敗しました: ${error.message}`);
  return `/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery&next=/update-password`;
}
