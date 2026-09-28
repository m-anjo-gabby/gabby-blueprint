/**
 * target-sessions-adjustment-seed.ts で投入したデータに対し、
 * admin_adjust_schedule_target_sessions RPCの振る舞いを実サインインJWT経由で検証する。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260918-dev/target-sessions-adjustment-verify.ts --env=dev --tag=targetsessions01
 *
 * 事前にtarget-sessions-adjustment-seed.tsを同じ--tagで実行しておくこと。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { writeResultLog, type CheckResult } from "../../../helpers/results.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;

const admin = await createAdminClient();
const checks: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log(`\n=== ライブセッション管理見直し(target_sessions個別調整)②シナリオ検証: env=${env} tag=${TAG} ===`);

async function findAuthUserByEmail(email: string): Promise<string | undefined> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return undefined;
}

async function getScheduleByNote(ticketNote: string, slotNo: number): Promise<{ schedule_id: string; target_sessions: number; status: number }> {
  const { data: ticket, error: ticketErr } = await admin
    .from("com_m_contract")
    .select("contract_id")
    .eq("note", ticketNote)
    .single();
  if (ticketErr) throw new Error(`契約が見つかりません(note=${ticketNote}): ${ticketErr.message}`);

  const { data: license, error: licenseErr } = await admin
    .from("com_t_user_license")
    .select("license_id")
    .eq("contract_id", ticket.contract_id)
    .single();
  if (licenseErr) throw new Error(`ライセンスが見つかりません: ${licenseErr.message}`);

  const { data: t, error: tErr } = await admin
    .from("com_t_user_session_ticket")
    .select("ticket_id")
    .eq("license_id", license.license_id)
    .single();
  if (tErr) throw new Error(`チケットが見つかりません: ${tErr.message}`);

  const { data: schedule, error: sErr } = await admin
    .from("com_m_lesson_schedule")
    .select("schedule_id, target_sessions, status")
    .eq("ticket_id", t.ticket_id)
    .eq("slot_no", slotNo)
    .single();
  if (sErr) throw new Error(`定期スケジュール枠が見つかりません: ${sErr.message}`);
  return schedule as { schedule_id: string; target_sessions: number; status: number };
}

async function countSessions(scheduleId: string): Promise<number> {
  const { count, error } = await admin.from("com_t_session").select("session_id", { count: "exact", head: true }).eq("schedule_id", scheduleId);
  if (error) throw error;
  return count ?? 0;
}

const taId = await findAuthUserByEmail(`${TAG}-tsadj-student-ta@gabby-qa-test.example`);
const tbId = await findAuthUserByEmail(`${TAG}-tsadj-student-tb@gabby-qa-test.example`);
const tcId = await findAuthUserByEmail(`${TAG}-tsadj-student-tc@gabby-qa-test.example`);
const coachId = await findAuthUserByEmail(`${TAG}-tsadj-coach@gabby-qa-test.example`);
if (!taId || !tbId || !tcId || !coachId) {
  throw new Error("必要なQAユーザーが見つかりません。先にtarget-sessions-adjustment-seed.tsを実行してください。");
}

const taSchedule = await getScheduleByNote(`QA自動テスト(${TAG}) 生徒TA target_sessions正常系`, 1);
const tbSchedule = await getScheduleByNote(`QA自動テスト(${TAG}) 生徒TB target_sessions異常系`, 1);
const tcSchedule = await getScheduleByNote(`QA自動テスト(${TAG}) 生徒TC target_sessions非稼働枠`, 1);

const adminClient: SupabaseClient = await signInAsRole("qa-admin@gabby-qa-test.example", PASSWORD);
const taStudentClient: SupabaseClient = await signInAsRole(`${TAG}-tsadj-student-ta@gabby-qa-test.example`, PASSWORD);
const coachClient: SupabaseClient = await signInAsRole(`${TAG}-tsadj-coach@gabby-qa-test.example`, PASSWORD);

// ---------------------------------------------------------------------------
// シナリオ1〜3: 生徒TA — 正常系(引き上げ成功・shortfall増加・セッション未生成)
// ---------------------------------------------------------------------------
{
  const before = taSchedule.target_sessions;
  const newValue = before + 3;
  const sessionCountBefore = await countSessions(taSchedule.schedule_id);
  const { data: shortfallBeforeRows, error: shortfallBeforeErr } = await admin.rpc("fn_schedule_shortfall", { p_schedule_id: taSchedule.schedule_id });
  if (shortfallBeforeErr) throw shortfallBeforeErr;
  const shortfallBefore = (shortfallBeforeRows as { shortfall: number }[])[0].shortfall;

  const { error } = await adminClient.rpc("admin_adjust_schedule_target_sessions", {
    p_schedule_id: taSchedule.schedule_id,
    p_new_target_sessions: newValue,
    p_reason: `QA自動テスト(${TAG}) 正常系引き上げ`,
  });
  record("シナリオ1: アドミンが現在値+3、理由付きでtarget_sessionsを引き上げられる", !error, error ? `${error.code} ${error.message}` : undefined);

  const { data: after, error: afterErr } = await admin.from("com_m_lesson_schedule").select("target_sessions").eq("schedule_id", taSchedule.schedule_id).single();
  if (afterErr) throw afterErr;
  record(
    "シナリオ1補足: com_m_lesson_schedule.target_sessionsが実際に新しい値になっている",
    after.target_sessions === newValue,
    `expected=${newValue}, actual=${after.target_sessions}`
  );

  const { data: shortfallAfterRows, error: shortfallAfterErr } = await admin.rpc("fn_schedule_shortfall", { p_schedule_id: taSchedule.schedule_id });
  if (shortfallAfterErr) throw shortfallAfterErr;
  const shortfallAfter = (shortfallAfterRows as { shortfall: number }[])[0].shortfall;
  record(
    "シナリオ2: target_sessions引き上げ後、fn_schedule_shortfallのshortfallが引き上げ分(+3)だけ増加している",
    shortfallAfter === shortfallBefore + 3,
    `before=${shortfallBefore}, after=${shortfallAfter}`
  );

  const sessionCountAfter = await countSessions(taSchedule.schedule_id);
  record(
    "シナリオ3: target_sessions引き上げはcom_t_sessionを自動生成しない(件数が変化しない)",
    sessionCountAfter === sessionCountBefore,
    `before=${sessionCountBefore}, after=${sessionCountAfter}`
  );
}

// ---------------------------------------------------------------------------
// シナリオ4〜7: 生徒TB — 異常系(現在値と同じ/未満・理由空/空白)。対象データは変更されない。
// ---------------------------------------------------------------------------
{
  const current = tbSchedule.target_sessions;

  {
    const { error } = await adminClient.rpc("admin_adjust_schedule_target_sessions", {
      p_schedule_id: tbSchedule.schedule_id,
      p_new_target_sessions: current,
      p_reason: `QA自動テスト(${TAG}) 現在値と同じ`,
    });
    record(
      "シナリオ4: 現在値と同じ値を指定すると拒否される",
      !!error && /must be greater than/.test(error.message),
      error ? `${error.code} ${error.message}` : "エラーなしで成功してしまった"
    );
  }

  {
    const { error } = await adminClient.rpc("admin_adjust_schedule_target_sessions", {
      p_schedule_id: tbSchedule.schedule_id,
      p_new_target_sessions: current - 1,
      p_reason: `QA自動テスト(${TAG}) 現在値未満`,
    });
    record(
      "シナリオ5: 現在値未満の値を指定すると拒否される",
      !!error && /must be greater than/.test(error.message),
      error ? `${error.code} ${error.message}` : "エラーなしで成功してしまった"
    );
  }

  {
    const { error } = await adminClient.rpc("admin_adjust_schedule_target_sessions", {
      p_schedule_id: tbSchedule.schedule_id,
      p_new_target_sessions: current + 1,
      p_reason: "",
    });
    record(
      "シナリオ6: 理由を空文字で指定すると拒否される",
      !!error && /reason is required/.test(error.message),
      error ? `${error.code} ${error.message}` : "エラーなしで成功してしまった"
    );
  }

  {
    const { error } = await adminClient.rpc("admin_adjust_schedule_target_sessions", {
      p_schedule_id: tbSchedule.schedule_id,
      p_new_target_sessions: current + 1,
      p_reason: "   ",
    });
    record(
      "シナリオ7: 理由を空白のみで指定すると拒否される(btrimによる前後空白除去)",
      !!error && /reason is required/.test(error.message),
      error ? `${error.code} ${error.message}` : "エラーなしで成功してしまった"
    );
  }

  const { data: tbAfter, error: tbAfterErr } = await admin.from("com_m_lesson_schedule").select("target_sessions").eq("schedule_id", tbSchedule.schedule_id).single();
  if (tbAfterErr) throw tbAfterErr;
  record(
    "シナリオ4〜7補足: いずれも拒否され、生徒TBのtarget_sessionsは変更されていない",
    tbAfter.target_sessions === current,
    `expected(unchanged)=${current}, actual=${tbAfter.target_sessions}`
  );
}

// ---------------------------------------------------------------------------
// シナリオ8: 生徒TC — 一時停止(paused)の枠に対しては拒否される
// ---------------------------------------------------------------------------
{
  const { error } = await adminClient.rpc("admin_adjust_schedule_target_sessions", {
    p_schedule_id: tcSchedule.schedule_id,
    p_new_target_sessions: tcSchedule.target_sessions + 1,
    p_reason: `QA自動テスト(${TAG}) 非稼働枠`,
  });
  record(
    "シナリオ8: 一時停止(paused)の枠に対しては拒否される",
    !!error && /non-active schedule slot/.test(error.message),
    error ? `${error.code} ${error.message}` : "エラーなしで成功してしまった"
  );
}

// ---------------------------------------------------------------------------
// シナリオ9〜10: 生徒TAの枠 — 権限系(生徒本人・コーチ本人はいずれも拒否される)
// ---------------------------------------------------------------------------
{
  const { data: taCurrent, error: taCurrentErr } = await admin.from("com_m_lesson_schedule").select("target_sessions").eq("schedule_id", taSchedule.schedule_id).single();
  if (taCurrentErr) throw taCurrentErr;

  {
    const { error } = await taStudentClient.rpc("admin_adjust_schedule_target_sessions", {
      p_schedule_id: taSchedule.schedule_id,
      p_new_target_sessions: taCurrent.target_sessions + 1,
      p_reason: `QA自動テスト(${TAG}) 生徒本人による呼び出し`,
    });
    record(
      "シナリオ9: 生徒本人のJWTでは拒否される",
      !!error && /not authorized to adjust target sessions/.test(error.message),
      error ? `${error.code} ${error.message}` : "エラーなしで成功してしまった"
    );
  }

  {
    const { error } = await coachClient.rpc("admin_adjust_schedule_target_sessions", {
      p_schedule_id: taSchedule.schedule_id,
      p_new_target_sessions: taCurrent.target_sessions + 1,
      p_reason: `QA自動テスト(${TAG}) コーチ本人による呼び出し`,
    });
    record(
      "シナリオ10: コーチ本人のJWTでは拒否される",
      !!error && /not authorized to adjust target sessions/.test(error.message),
      error ? `${error.code} ${error.message}` : "エラーなしで成功してしまった"
    );
  }
}

// ---------------------------------------------------------------------------
// シナリオ11: 存在しないschedule_idを指定すると拒否される
// ---------------------------------------------------------------------------
{
  const { error } = await adminClient.rpc("admin_adjust_schedule_target_sessions", {
    p_schedule_id: "00000000-0000-0000-0000-000000000000",
    p_new_target_sessions: 99,
    p_reason: `QA自動テスト(${TAG}) 存在しないID`,
  });
  record(
    "シナリオ11: 存在しないschedule_idを指定すると拒否される",
    !!error && /not found/.test(error.message),
    error ? `${error.code} ${error.message}` : "エラーなしで成功してしまった"
  );
}

await adminClient.auth.signOut();
await taStudentClient.auth.signOut();
await coachClient.auth.signOut();

const log = writeResultLog({ scenario: "target-sessions-adjustment.feature", env, tag: TAG, checks });
process.exit(log.ok ? 0 : 1);
