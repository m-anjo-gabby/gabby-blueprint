/**
 * 専属コーチ検索（生徒 /coach-matching）のデモコーチ除外の検証。
 * get_matchable_coach_ids() が「通常の生徒にはデモコーチを返さず、デモの生徒には全コーチを返す」ことを、
 * 各生徒の実サインインJWTで確認する（auth.uid() で呼び出し元を判定するため service_role は使わない）。
 * コーチ一覧（getCoachBrowseListCore）と申請時のチェック（createMatchingRequestCore）はどちらもこのRPCの
 * 結果だけで対象コーチを決めるため、RPCの戻り値を確認すれば両方の判定を確認したことになる。
 *
 * 固定アカウント（testing/FIXTURES.md。seed-fixed-accounts.tsで投入済み）をそのまま使う読み取り専用の
 * 検証のため、seed/cleanupは無い。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260925-dev/demo-coach-matching-verify.ts --env=dev
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, signInAsRole, signOutRole } from '../../../helpers/auth.ts';
import { loadTestEnv, resolveTestEnvFromArgs } from '../../../helpers/env.ts';
import { assertReleaseApplied } from '../../../helpers/preflight.ts';
import { writeResultLog, type CheckResult } from '../../../helpers/results.ts';

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith('--tag='))?.split('=')[1] ?? 'auto';
const PASSWORD = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD) {
  throw new Error('QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。');
}

const service = await createAdminClient(); // 固定アカウントのID解決・preflight専用
const checks: CheckResult[] = [];
function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'OK ' : 'NG '} ${name}${detail ? ` … ${detail}` : ''}`);
}

console.log(`\n=== 専属コーチ検索のデモコーチ除外の検証: env=${env} tag=${TAG} ===`);

await assertReleaseApplied(service, [
  { name: 'get_matchable_coach_ids', dummyArgs: { p_ticket_id: '00000000-0000-0000-0000-000000000000' } },
]);

async function coachIdOf(userName: string): Promise<string> {
  const { data, error } = await service.from('com_m_user').select('id').eq('user_name', userName).single();
  if (error)
    throw new Error(
      `固定アカウント ${userName} が見つかりません（seed-fixed-accounts.tsを先に実行してください）: ${error.message}`,
    );
  return data.id as string;
}
const coachCa = await coachIdOf('QAコーチCA01');
const coachUs = await coachIdOf('QAコーチUS01');
const coachDemo = await coachIdOf('QAコーチDEMO01（デモ）');

// --- ロールマスタ ------------------------------------------------------------
const { data: role } = await service.from('com_m_role').select('target_user_type').eq('role_id', 'demo_user').single();
record(
  'com_m_role: demo_user が共通ロール（target_user_type=NULL）になっている（コーチにも付与できる）',
  role?.target_user_type === null,
  `target_user_type=${String(role?.target_user_type)}`,
);

// --- 生徒ごとの対象コーチ ----------------------------------------------------
/** 生徒自身のライブセッションのチケット（get_matchable_coach_ids はチケットごとに対象を返す） */
async function ownTicketId(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.from('com_t_user_session_ticket').select('ticket_id').limit(1).maybeSingle();
  if (error) throw new Error(`生徒のチケットを取得できません: ${error.message}`);
  return (data?.ticket_id as string | undefined) ?? null;
}

async function matchableIds(email: string): Promise<{ ids: Set<string>; demoLookup: unknown } | null> {
  const client = await signInAsRole(email, PASSWORD!);
  const ticketId = await ownTicketId(client);
  if (!ticketId) {
    // 「専属コーチを探す」はライブのチケットごとのため、チケットの無い生徒は確認できない
    console.log(`SKIP ${email}: ライブセッションのチケットが無いため確認できません`);
    await signOutRole(client);
    return null;
  }
  const { data, error } = await client.rpc('get_matchable_coach_ids', { p_ticket_id: ticketId });
  if (error) throw new Error(`${email}: get_matchable_coach_ids 失敗: ${error.message}`);
  // 申請時のチェック（createMatchingRequestCore）と同じ呼び出し方
  const { data: demoLookup } = await client
    .rpc('get_matchable_coach_ids', { p_ticket_id: ticketId })
    .eq('coach_id', coachDemo)
    .maybeSingle();
  await signOutRole(client);
  return { ids: new Set((data as { coach_id: string }[]).map((r) => r.coach_id)), demoLookup };
}

const normal = await matchableIds('qa-student-01@gabby-qa-test.example');
if (!normal)
  throw new Error(
    'qa-student-01 にライブセッションのチケットがありません（seed-fixed-accounts.tsを先に実行してください）',
  );
record('通常の生徒(01): 通常コーチ(CA01/US01)が対象に含まれる', normal.ids.has(coachCa) && normal.ids.has(coachUs));
record('通常の生徒(01): デモコーチは対象に含まれない（一覧に出ない）', !normal.ids.has(coachDemo));
record(
  '通常の生徒(01): デモコーチIDを指定した申請時チェックは該当なし（not_eligible になる）',
  normal.demoLookup === null,
);

const demo = await matchableIds('qa-student-06@gabby-qa-test.example');
if (demo) {
  record('デモの生徒(06): 通常コーチ(CA01/US01)が対象に含まれる', demo.ids.has(coachCa) && demo.ids.has(coachUs));
  record('デモの生徒(06): デモコーチも対象に含まれる', demo.ids.has(coachDemo));
  record('デモの生徒(06): デモコーチIDを指定した申請時チェックが通る', demo.demoLookup !== null);
  record(
    'デモの生徒(06)の対象 = 通常の生徒(01)の対象 + デモコーチ',
    demo.ids.size >= normal.ids.size + 1 && [...normal.ids].every((id) => demo.ids.has(id)),
    `01=${normal.ids.size}件 / 06=${demo.ids.size}件`,
  );
}

const log = writeResultLog({ scenario: 'demo-coach-matching', env, tag: TAG, checks });
console.log(`\n結果: ${log.passed}/${log.totalChecks} OK`);
