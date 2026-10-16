/**
 * Webトライアルの生徒のコーチ検索（get_matchable_coach_ids(p_ticket_id)）の確認スクリプト。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20261016-dev/web-trial-coach-matching-check.ts --env=dev
 *
 * 確認すること:
 *   - Webトライアルのチケットでは「Webトライアル担当」（web_trial_coach）のコーチだけが返る
 *   - 担当のコーチは通常の生徒のチケットでも返る
 *   - 他人のチケットIDを渡しても何も返らない
 *   - コーチ宛の申請一覧と同じ結合（チケット → ライセンス → 契約 → プラン）で WEB_TRIAL を判定できる
 *
 * 使い捨てのトライアルの生徒（Webトライアルの顧客・その月の契約・ライセンス・チケット）を作り、最後に削除する。
 * qa-coach-us-01 に一時的にロールを付け、最後に実行前の状態へ戻す（データは残らない）。
 * RPC は各生徒の実JWTで呼ぶ。前提: qa-coach-us-01 はマッチングの条件（プロフィール・空き時間等）がそろっている。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WEB_TRIAL_CLIENT_ID } from "../../../../packages/types/trialApplication.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const PASSWORD = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}

const COACH_EMAIL = "qa-coach-us-01@gabby-qa-test.example";
const STUDENT_EMAIL = "qa-student-01@gabby-qa-test.example";
const TRIAL_EMAIL = `qa-trial-matching-${Date.now()}@gabby-qa-test.example`;
const ROLE_ID = "web_trial_coach";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  NG   ${label}`, detail ?? "");
  }
}

async function userId(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("ユーザーを取得できませんでした");
  return data.user.id;
}

async function matchableIds(student: SupabaseClient, ticketId: string): Promise<string[]> {
  const { data, error } = await student.rpc("get_matchable_coach_ids", { p_ticket_id: ticketId });
  if (error) throw error;
  return ((data ?? []) as { coach_id: string }[]).map((r) => r.coach_id);
}

/** コーチ宛の申請一覧（attachRequestDetails）と同じ結合でプランのコードを読む */
async function planCodeOf(service: SupabaseClient, ticketId: string): Promise<string | undefined> {
  const { data, error } = await service
    .from("com_t_user_session_ticket")
    .select("ticket_id, com_t_user_license!inner(start_date, end_date, com_m_contract!inner(com_m_contract_plan!inner(plan_code)))")
    .eq("ticket_id", ticketId)
    .single();
  if (error) throw error;
  const first = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v) ?? undefined;
  type Row = { com_m_contract: { com_m_contract_plan: { plan_code: string } | { plan_code: string }[] } | { com_m_contract_plan: { plan_code: string } }[] };
  const license = first(data.com_t_user_license as unknown as Row | Row[]);
  return first(first(license?.com_m_contract)?.com_m_contract_plan)?.plan_code;
}

async function main(): Promise<void> {
  const service = await createAdminClient();
  const coach = await signInAsRole(COACH_EMAIL, PASSWORD!);
  const student = await signInAsRole(STUDENT_EMAIL, PASSWORD!);
  const coachId = await userId(coach);
  const studentId = await userId(student);
  await signOutRole(coach);

  const { data: studentTicket, error: studentTicketError } = await service
    .from("com_t_user_session_ticket")
    .select("ticket_id, com_t_user_license!inner(end_date)")
    .eq("user_id", studentId)
    .gt("com_t_user_license.end_date", new Date().toISOString())
    .limit(1)
    .single();
  if (studentTicketError) throw new Error(`${STUDENT_EMAIL} の有効なチケットがありません: ${studentTicketError.message}`);

  const { data: originalRole } = await service.from("com_t_user_role").select("role_id").eq("user_id", coachId).eq("role_id", ROLE_ID).maybeSingle();
  const { data: contractsBefore } = await service.from("com_m_contract").select("contract_id").eq("client_id", WEB_TRIAL_CLIENT_ID);
  const contractIdsBefore = new Set((contractsBefore ?? []).map((c) => c.contract_id as string));

  let trialUserId: string | undefined;
  let trial: SupabaseClient | undefined;
  try {
    // 使い捨てのトライアルの生徒
    const { data: created, error: createError } = await service.auth.admin.createUser({ email: TRIAL_EMAIL, password: PASSWORD!, email_confirm: true });
    if (createError || !created.user) throw createError ?? new Error("トライアルの生徒を作れませんでした");
    trialUserId = created.user.id;
    // com_m_user の行は auth のユーザー作成時に自動で作られる
    const { error: userError } = await service
      .from("com_m_user")
      .upsert({ id: trialUserId, client_id: WEB_TRIAL_CLIENT_ID, user_type: "1", user_name: "QA Trial Matching" });
    if (userError) throw userError;
    const { data: contractId, error: contractError } = await service.rpc("fn_resolve_web_trial_contract", { p_at: new Date().toISOString() });
    if (contractError || !contractId) throw contractError ?? new Error("トライアルの契約を取得できませんでした");
    const start = new Date();
    const end = new Date(start.getTime() + 14 * 86_400_000);
    const { data: license, error: licenseError } = await service
      .from("com_t_user_license")
      .insert({ contract_id: contractId, user_id: trialUserId, start_date: start.toISOString(), end_date: end.toISOString() })
      .select("license_id")
      .single();
    if (licenseError) throw licenseError;
    const { data: trialTicket, error: ticketError } = await service
      .from("com_t_user_session_ticket")
      .insert({ license_id: license.license_id, contract_id: contractId, user_id: trialUserId, weekly_frequency: 1, total_sessions: 1 })
      .select("ticket_id")
      .single();
    if (ticketError) throw ticketError;
    trial = await signInAsRole(TRIAL_EMAIL, PASSWORD!);

    console.log(`[${env}] 対象コーチ ${COACH_EMAIL}（実行前のロール: ${originalRole ? "あり" : "なし"}）`);

    check("トライアルのチケットはプランが WEB_TRIAL と判定される（申請一覧の結合）", (await planCodeOf(service, trialTicket.ticket_id)) === "WEB_TRIAL");
    check("通常の生徒のチケットは WEB_TRIAL ではない", (await planCodeOf(service, studentTicket.ticket_id)) !== "WEB_TRIAL");

    // ロールなし
    await service.from("com_t_user_role").delete().eq("user_id", coachId).eq("role_id", ROLE_ID);
    check("ロールなし: 通常の生徒には出る", (await matchableIds(student, studentTicket.ticket_id)).includes(coachId));
    check("ロールなし: トライアルの生徒には出ない", !(await matchableIds(trial, trialTicket.ticket_id)).includes(coachId));

    // ロールあり
    const { error: grantError } = await service.from("com_t_user_role").insert({ user_id: coachId, role_id: ROLE_ID });
    if (grantError) throw grantError;
    const trialIds = await matchableIds(trial, trialTicket.ticket_id);
    check("ロールあり: トライアルの生徒に出る", trialIds.includes(coachId));
    const { data: holders } = await service.from("com_t_user_role").select("user_id").eq("role_id", ROLE_ID);
    const holderIds = new Set((holders ?? []).map((h) => h.user_id as string));
    check("ロールあり: トライアルの生徒には担当のコーチだけが出る", trialIds.every((id) => holderIds.has(id)), trialIds);
    check("ロールあり: 通常の生徒にも出る", (await matchableIds(student, studentTicket.ticket_id)).includes(coachId));

    // 他人のチケット
    check("他人のチケットIDでは何も返らない（トライアルの生徒 → 通常の生徒のチケット）", (await matchableIds(trial, studentTicket.ticket_id)).length === 0);
    check("他人のチケットIDでは何も返らない（通常の生徒 → トライアルのチケット）", (await matchableIds(student, trialTicket.ticket_id)).length === 0);
  } finally {
    // ロールを実行前の状態へ戻す
    await service.from("com_t_user_role").delete().eq("user_id", coachId).eq("role_id", ROLE_ID);
    if (originalRole) await service.from("com_t_user_role").insert({ user_id: coachId, role_id: ROLE_ID });
    if (trial) await signOutRole(trial);
    await signOutRole(student);
    if (trialUserId) {
      for (const table of ["com_t_user_session_ticket", "com_t_user_license", "student_m_sprint_progress"]) {
        await service.from(table).delete().eq("user_id", trialUserId);
      }
      await service.from("com_m_user").delete().eq("id", trialUserId);
      const { error } = await service.auth.admin.deleteUser(trialUserId);
      if (error) console.warn(`トライアルの生徒の削除に失敗: ${trialUserId} ${error.message}`);
    }
    const { data: contractsAfter } = await service.from("com_m_contract").select("contract_id").eq("client_id", WEB_TRIAL_CLIENT_ID);
    const createdContracts = (contractsAfter ?? []).map((c) => c.contract_id as string).filter((id) => !contractIdsBefore.has(id));
    if (createdContracts.length > 0) await service.from("com_m_contract").delete().in("contract_id", createdContracts);
  }

  console.log(failures === 0 ? "\nすべて OK" : `\nNG: ${failures} 件`);
  if (failures > 0) process.exit(1);
}

await main();
