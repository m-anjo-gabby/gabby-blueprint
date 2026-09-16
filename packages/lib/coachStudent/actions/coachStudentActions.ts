'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import {
  AssignedStudentSummary,
  CoachStudentNote,
  ContractTrainingReport,
  GetAssignedStudentsResult,
  GetStudentOverviewResult,
  GetStudentUpcomingSessionResult,
  GetStudentLiveSessionShortfallsResult,
  GetStudentLiveSessionContractsResult,
  GetStudentSessionsByTicketResult,
  LiveSessionShortfallItem,
  GetStudentNotesResult,
  GetSelfTrainingWeekSummaryResult,
  AddCoachStudentNoteResult,
  GetContractTrainingReportsResult,
  SaveContractTrainingReportDraftResult,
  FinalizeContractTrainingReportResult,
  UpdateStudentSprintProgressResult,
  StudentSprintProgress,
  StudentLatestContractSummary,
  StudentContractSessionSummary,
  StudentNextSessionSummary,
  TRAINING_REPORT_STATUS,
} from '@gabby/types/coachStudent';
import { SESSION_STATUS, SESSION_RESULT_STATUSES } from '@gabby/types/session';
import { QUESTION_TYPES, SprintQuestionType } from '@gabby/types/sprint';
import { MAX_STAGE, StageLevels } from '@gabby/types/stageProgression';
import { clampLevel, computeStage, getForcedLevels } from '../../sprint/stageProgression';

const logger = createLogger('common');
const MAX_NOTE_LENGTH = 4000;
const MAX_TRAINING_REPORT_LENGTH = 8000;

/** StudentSprintProgress(dbKey命名) <-> StageLevels(SprintQuestionTypeキー) の相互変換 */
function toStageLevels(progress: StudentSprintProgress): StageLevels {
  return {
    '0': progress.level_speed,
    '4': progress.level_structure,
    '5': progress.level_builders,
    '6': progress.level_mastery,
  };
}

/**
 * ログイン中コーチが指定の生徒と担当関係を持つか判定する。
 * com_m_coach_student_relationshipはis_active(現役か)を問わず判定する（コーチ交代後も、
 * 過去に担当したコーチが引き継ぎ目的でStudent Overviewを閲覧できるようにするため）。
 */
export async function hasCoachStudentRelationship(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  coachId: string,
  studentId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('com_m_coach_student_relationship')
    .select('relationship_id')
    .eq('coach_id', coachId)
    .eq('student_id', studentId)
    .limit(1);
  return Boolean(data && data.length > 0);
}

type ContractJoinRow = { plan_name: string; plan_name_en: string } | { plan_name: string; plan_name_en: string }[] | null;

/**
 * 指定した生徒ID群それぞれについて、現在有効・終了済みを問わず最新の契約(ライセンス)1件を取得する。
 * 生徒一覧カードの「直近の契約」表示用。com_t_user_licenseのstatus(0:停止)で絞り込まないのは、
 * 途中解約されたライセンスも「その生徒が最後に持っていた契約」として表示したいため
 * （is_currentで現役/終了済みを区別する）。
 */
async function getLatestContractsByStudentIds(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  studentIds: string[]
): Promise<{ data: Map<string, StudentLatestContractSummary> | null; error: string | null }> {
  const { data: licenses, error } = await supabase
    .from('com_t_user_license')
    .select('user_id, start_date, end_date, status, com_m_contract(plan_name, plan_name_en)')
    .in('user_id', studentIds);

  if (error) {
    return { data: null, error: error.message };
  }

  const nowIso = new Date().toISOString();
  const latestByStudent = new Map<string, StudentLatestContractSummary & { _end: string }>();

  for (const license of licenses ?? []) {
    const contractJoin = license.com_m_contract as ContractJoinRow;
    const contract = Array.isArray(contractJoin) ? contractJoin[0] : contractJoin;
    if (!contract) continue;

    const current = latestByStudent.get(license.user_id);
    if (current && current._end >= license.end_date) continue;

    latestByStudent.set(license.user_id, {
      plan_name: contract.plan_name,
      plan_name_en: contract.plan_name_en,
      start_date: license.start_date,
      end_date: license.end_date,
      is_current: license.status === 1 && license.start_date <= nowIso && nowIso <= license.end_date,
      _end: license.end_date,
    });
  }

  const result = new Map<string, StudentLatestContractSummary>();
  for (const [studentId, contract] of latestByStudent) {
    const { _end: _discard, ...summary } = contract;
    result.set(studentId, summary);
  }
  return { data: result, error: null };
}

/**
 * 指定した現役生徒ID群それぞれについて、次に実施可能な（status=scheduled かつ終了予定時刻が
 * 未来の）セッションを1件ずつ取得する。生徒一覧カードの「Next Live Session」表示用。
 * 過去に担当していた生徒（is_active=false）は呼び出し側で対象から除外すること
 * （担当関係を終えた生徒に新規セッションが発生することは無く、問い合わせても無駄になるため）。
 */
async function getUpcomingSessionsByStudentIds(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  coachId: string,
  activeStudentIds: string[]
): Promise<{ data: Map<string, StudentNextSessionSummary> | null; error: string | null }> {
  if (activeStudentIds.length === 0) {
    return { data: new Map(), error: null };
  }

  const { data: sessions, error } = await supabase
    .from('com_t_session')
    .select('session_id, student_id, start_datetime')
    .eq('coach_id', coachId)
    .in('student_id', activeStudentIds)
    .eq('status', SESSION_STATUS.SCHEDULED)
    .gt('end_datetime', new Date().toISOString())
    .order('start_datetime', { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  // start_datetime昇順のため、生徒ごとに最初に出現した行が最も近い次回セッションになる
  const nextByStudent = new Map<string, StudentNextSessionSummary>();
  for (const session of sessions ?? []) {
    if (nextByStudent.has(session.student_id)) continue;
    nextByStudent.set(session.student_id, { session_id: session.session_id, start_datetime: session.start_datetime });
  }
  return { data: nextByStudent, error: null };
}

/**
 * ログイン中コーチに紐づく生徒の一覧を取得する（コーチ向け、現在・過去の担当関係を両方含む）
 * ダッシュボードの担当生徒プレビューおよび生徒一覧画面で使用する。
 */
export async function getAssignedStudentsCore(): Promise<GetAssignedStudentsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: relationships, error } = await supabase
      .from('com_m_coach_student_relationship')
      .select('student_id, is_active')
      .eq('coach_id', user.id);

    if (error) {
      logger.error('coachStudent:get_assigned_students_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!relationships || relationships.length === 0) {
      return { success: true, students: [] };
    }

    const studentIds = relationships.map((r) => r.student_id);
    const isActiveByStudent = new Map(relationships.map((r) => [r.student_id, r.is_active]));
    // 過去生徒には新規セッションが発生しないため、次回セッションの問い合わせは現役生徒のみに絞る
    const activeStudentIds = relationships.filter((r) => r.is_active).map((r) => r.student_id);

    const [
      { data: users, error: userError },
      { data: progress, error: progressError },
      { data: schedules, error: scheduleError },
      { data: latestContractByStudent, error: contractError },
      { data: nextSessionByStudent, error: nextSessionError },
    ] = await Promise.all([
      supabase.from('com_m_user').select('id, user_name, icon_path').in('id', studentIds),
      supabase
        .from('student_m_sprint_progress')
        .select('user_id, stage, level_speed, level_structure, level_builders, level_mastery')
        .in('user_id', studentIds),
      supabase
        .from('com_m_lesson_schedule')
        .select('student_id')
        .eq('coach_id', user.id)
        .eq('status', 1)
        .in('student_id', studentIds),
      getLatestContractsByStudentIds(supabase, studentIds),
      getUpcomingSessionsByStudentIds(supabase, user.id, activeStudentIds),
    ]);

    if (userError || progressError || scheduleError || contractError || nextSessionError) {
      logger.error(
        'coachStudent:get_assigned_students_join_failed',
        userError?.message ?? progressError?.message ?? scheduleError?.message ?? contractError ?? nextSessionError ?? 'unknown',
        { ...ctx, userId: user.id }
      );
      return { success: false, errorCode: 'unexpected_error' };
    }

    const userById = new Map((users ?? []).map((u) => [u.id, u]));
    const progressByStudent = new Map((progress ?? []).map((p) => [p.user_id, p]));
    const slotCountByStudent = new Map<string, number>();
    for (const s of schedules ?? []) {
      slotCountByStudent.set(s.student_id, (slotCountByStudent.get(s.student_id) ?? 0) + 1);
    }

    const students: AssignedStudentSummary[] = studentIds.map((studentId) => {
      const u = userById.get(studentId);
      const p = progressByStudent.get(studentId);
      return {
        student_id: studentId,
        user_name: u?.user_name ?? '(Unknown)',
        icon_path: u?.icon_path ?? null,
        stage: p?.stage ?? 0,
        level_speed: p?.level_speed ?? 0,
        level_structure: p?.level_structure ?? 0,
        level_builders: p?.level_builders ?? 0,
        level_mastery: p?.level_mastery ?? 0,
        active_slot_count: slotCountByStudent.get(studentId) ?? 0,
        is_active: isActiveByStudent.get(studentId) ?? false,
        latest_contract: latestContractByStudent?.get(studentId) ?? null,
        next_session: nextSessionByStudent?.get(studentId) ?? null,
      };
    });

    // アクティブ生徒は名前順、過去生徒は直近の契約終了日が新しい順（直近であればケアが必要な可能性が高いため）
    students.sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      if (a.is_active) return a.user_name.localeCompare(b.user_name);
      return (b.latest_contract?.end_date ?? '').localeCompare(a.latest_contract?.end_date ?? '');
    });

    return { success: true, students };
  } catch (err) {
    logger.error('coachStudent:get_assigned_students_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * Student Overview画面向けに、指定生徒の基本情報とスプリント進捗を取得する（コーチ向け）
 * 担当関係（現在または過去のcom_m_coach_student_relationship）がない生徒IDが指定された場合は forbidden を返す。
 */
export async function getStudentOverviewCore(studentId: string): Promise<GetStudentOverviewResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!(await hasCoachStudentRelationship(supabase, user.id, studentId))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const nowIso = new Date().toISOString();

    const [
      { data: student, error: userError },
      { data: progress, error: progressError },
      { data: license, error: licenseError },
    ] = await Promise.all([
      supabase.from('com_m_user').select('id, user_name, icon_path, timezone').eq('id', studentId).maybeSingle(),
      supabase
        .from('student_m_sprint_progress')
        .select('stage, level_speed, level_structure, level_builders, level_mastery')
        .eq('user_id', studentId)
        .maybeSingle(),
      supabase
        .from('com_t_user_license')
        .select('license_id, start_date, end_date, com_m_contract!inner(plan_name, plan_name_en, status)')
        .eq('user_id', studentId)
        .eq('status', 1)
        .eq('com_m_contract.status', 1)
        .lte('start_date', nowIso)
        .gte('end_date', nowIso)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (userError || progressError || licenseError) {
      logger.error(
        'coachStudent:get_overview_failed',
        userError?.message ?? progressError?.message ?? licenseError?.message ?? 'unknown',
        { ...ctx, userId: user.id, payload: { studentId } }
      );
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!student) {
      return { success: false, errorCode: 'forbidden' };
    }

    const contract = license
      ? Array.isArray(license.com_m_contract)
        ? license.com_m_contract[0]
        : license.com_m_contract
      : null;

    const sessionSummary =
      license && contract
        ? await computeStudentContractSessionSummary(supabase, user.id, studentId, license.license_id, ctx)
        : null;

    return {
      success: true,
      profile: {
        student_id: student.id,
        user_name: student.user_name ?? '(Unknown)',
        icon_path: student.icon_path ?? null,
        timezone: student.timezone ?? 'Asia/Tokyo',
        sprint_progress: {
          stage: progress?.stage ?? 0,
          level_speed: progress?.level_speed ?? 0,
          level_structure: progress?.level_structure ?? 0,
          level_builders: progress?.level_builders ?? 0,
          level_mastery: progress?.level_mastery ?? 0,
        },
        active_contract:
          license && contract
            ? {
                plan_name: contract.plan_name,
                plan_name_en: contract.plan_name_en,
                start_date: license.start_date,
                end_date: license.end_date,
              }
            : null,
        session_summary: sessionSummary,
      },
    };
  } catch (err) {
    logger.error('coachStudent:get_overview_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒が保有するライブセッションチケット付き契約の一覧（現在有効・過去満了分の両方）を
 * 取得する（コーチ向け、Live Sessionsカードの契約切替用）。生徒側のgetMyLiveSessionContractsCore
 * と同じ形だが、対象がログイン中の本人ではなく「担当関係にある特定の生徒」である点が異なる。
 * ticket/licenseへの参照は「担当関係にある生徒であれば、担当した契約かどうかを問わず参照可能」
 * というRLS（com_t_user_session_ticket/com_t_user_licenseに既存）にそのまま乗る。
 */
export async function getStudentLiveSessionContractsCore(studentId: string): Promise<GetStudentLiveSessionContractsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!(await hasCoachStudentRelationship(supabase, user.id, studentId))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: tickets, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('ticket_id, license_id, weekly_frequency')
      .eq('user_id', studentId);

    if (ticketError) {
      logger.error('coachStudent:get_student_contracts_ticket_failed', ticketError.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!tickets || tickets.length === 0) {
      return { success: true, contracts: [] };
    }

    const { data: licenses, error: licenseError } = await supabase
      .from('com_t_user_license')
      .select('license_id, status, start_date, end_date')
      .in('license_id', tickets.map((t) => t.license_id));

    if (licenseError) {
      logger.error('coachStudent:get_student_contracts_license_failed', licenseError.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const licenseById = new Map((licenses ?? []).map((l) => [l.license_id, l]));
    const now = new Date();

    const contracts = tickets
      .map((t) => {
        const license = licenseById.get(t.license_id);
        if (!license) return null;
        const isCurrent = license.status === 1 && new Date(license.start_date) <= now && now <= new Date(license.end_date);
        return {
          ticket_id: t.ticket_id,
          license_id: t.license_id,
          start_date: license.start_date,
          end_date: license.end_date,
          is_current: isCurrent,
          weekly_frequency: t.weekly_frequency,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));

    return { success: true, contracts };
  } catch (err) {
    logger.error('coachStudent:get_student_contracts_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒・指定契約(チケット)単位のセッション一覧を取得する（コーチ向け、Live Sessionsカード用）。
 * 週2回契約等で他コーチと分担しているケースや、過去に別のコーチから引き継いだケースがあるため、
 * 意図的にcoach_idでの絞り込みを行わない（RLS「Involved users can view sessions」の
 * 担当関係ベースの許可範囲をそのまま使う）。結果として担当外セッションも含まれうるため、
 * 表示側で「どのコーチが担当したか」を判別できるよう、coach_nameを解決して付与する。
 * 結果の詳細（call_log/chat/homework）は含めない・別途アクセス権が必要。
 */
export async function getStudentSessionsByTicketCore(studentId: string, ticketId: string): Promise<GetStudentSessionsByTicketResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!(await hasCoachStudentRelationship(supabase, user.id, studentId))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: sessions, error } = await supabase
      .from('com_t_session')
      .select('session_id, schedule_id, start_datetime, end_datetime, status, completion_result, cancel_category, rescheduled_from, cancel_reason, status_note, coach_id')
      .eq('student_id', studentId)
      .eq('ticket_id', ticketId)
      .order('start_datetime', { ascending: false });

    if (error) {
      logger.error('coachStudent:get_student_sessions_by_ticket_failed', error.message, { ...ctx, userId: user.id, payload: { studentId, ticketId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const rows = sessions ?? [];
    const coachIds = Array.from(new Set(rows.map((s) => s.coach_id)));
    let nameById = new Map<string, string>();
    if (coachIds.length > 0) {
      const { data: coaches } = await supabase.from('com_m_user').select('id, user_name').in('id', coachIds);
      nameById = new Map((coaches ?? []).map((c) => [c.id, c.user_name ?? '(Unknown)']));
    }

    return {
      success: true,
      sessions: rows.map((s) => ({ ...s, coach_name: nameById.get(s.coach_id) ?? '(Unknown)' })),
    };
  } catch (err) {
    logger.error('coachStudent:get_student_sessions_by_ticket_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒との、次に実施可能なセッション（status=scheduled かつ 終了予定時刻が未来）を1件取得する。
 * TodaysLessonPanelの「Start Live Session」「End Lesson」の対象決定に使用する専用クエリ。
 *
 * getStudentSessionHistoryCore（降順50件・履歴表示用）を流用しないのは、契約期間分まとめて
 * 事前生成されたセッションが50件を超える場合、降順+件数制限により直近（今日等）のセッションが
 * 取得結果から漏れ、次に近い将来のセッション（例: 来週分）が誤って選ばれてしまうため
 * （ライブルームがsession_id単位になったことで、生徒側と異なるセッションを選んでしまうと
 * 別々の部屋に入室してしまい、レッスンを開始できなくなる）。
 */
export async function getStudentUpcomingSessionCore(studentId: string): Promise<GetStudentUpcomingSessionResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: session, error } = await supabase
      .from('com_t_session')
      .select('session_id, schedule_id, start_datetime, end_datetime, status, rescheduled_from, cancel_reason, status_note')
      .eq('coach_id', user.id)
      .eq('student_id', studentId)
      .eq('status', SESSION_STATUS.SCHEDULED)
      .gt('end_datetime', new Date().toISOString())
      .order('start_datetime', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('coachStudent:get_upcoming_session_failed', error.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, session: session ?? null };
  } catch (err) {
    logger.error('coachStudent:get_upcoming_session_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒との、自分（コーチ）の定期スケジュールについて、契約セッション数に対する未消化枠（未割当
 * チケット）を検知する。マッチング申請が契約期間の途中（ライセンス開始日より後）に承認された場合や、
 * 生徒キャンセル(12時間以上前)・コーチキャンセルによりticket_refunded=trueとなった場合に発生する。
 * expected/actual/shortfallの算出はDB側のfn_schedule_shortfall()を唯一の真実源とし、
 * create_session_booking_request RPCの予約可否判定と齟齬が生じないようにする。
 */
type ScheduleShortfallRow = { expected_sessions: number; actual_sessions: number; shortfall: number };

/**
 * 指定コーチ・生徒の現在稼働中(status=1)スケジュールについて、fn_schedule_shortfall()を
 * スケジュール単位で呼び出す内部ヘルパー。com_m_lesson_scheduleのRLSがcoach_id=自分限定の
 * ため、他コーチのスケジュールは対象にできない（＝自分の担当分しか正確な期待値を計算できない）。
 * Live Sessionsカードの警告表示(getStudentLiveSessionShortfallsCore)と、Student Overview
 * ヘッダーの契約サマリー(getStudentOverviewCore内のown_unbooked集計)の両方から使う。
 */
async function fetchOwnScheduleShortfalls(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  coachId: string,
  studentId: string,
  ctx: Awaited<ReturnType<typeof getLogContext>>
): Promise<{ shortfalls: LiveSessionShortfallItem[] } | { errorMessage: string }> {
  const { data: schedules, error: scheduleError } = await supabase
    .from('com_m_lesson_schedule')
    .select('schedule_id, day_of_week, start_time')
    .eq('coach_id', coachId)
    .eq('student_id', studentId)
    .eq('status', 1);

  if (scheduleError) {
    return { errorMessage: scheduleError.message };
  }
  if (!schedules || schedules.length === 0) {
    return { shortfalls: [] };
  }

  const results = await Promise.all(
    schedules.map((schedule) =>
      supabase.rpc('fn_schedule_shortfall', { p_schedule_id: schedule.schedule_id }).single()
    )
  );

  const shortfalls: LiveSessionShortfallItem[] = [];
  schedules.forEach((schedule, index) => {
    const { error } = results[index];
    const data = results[index].data as ScheduleShortfallRow | null;
    if (error || !data) {
      logger.error('coachStudent:get_session_shortfalls_rpc_failed', error?.message ?? 'No row returned', { ...ctx, userId: coachId, payload: { studentId, scheduleId: schedule.schedule_id } });
      return;
    }
    if (data.shortfall > 0) {
      shortfalls.push({
        schedule_id: schedule.schedule_id,
        day_of_week: schedule.day_of_week,
        start_time: schedule.start_time,
        expected_sessions: data.expected_sessions,
        actual_sessions: data.actual_sessions,
        shortfall: data.shortfall,
      });
    }
  });

  return { shortfalls };
}

export async function getStudentLiveSessionShortfallsCore(studentId: string): Promise<GetStudentLiveSessionShortfallsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const result = await fetchOwnScheduleShortfalls(supabase, user.id, studentId, ctx);
    if ('errorMessage' in result) {
      logger.error('coachStudent:get_session_shortfalls_schedule_failed', result.errorMessage, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, shortfalls: result.shortfalls };
  } catch (err) {
    logger.error('coachStudent:get_session_shortfalls_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * active_contractに対応するチケットのセッション消化状況サマリーを算出する
 * （Student Overviewヘッダー用）。com_t_user_session_ticket.total_sessions/used_sessionsは
 * 担当関係のあるコーチなら誰でも参照できるRLS（2026-09-03追加）、com_t_sessionも担当外を
 * 含めて参照できるRLS（2026-09-08拡張）のため、消化済み・予約済みの集計自体はticket_id単位で
 * 全コーチ分をまとめて取得できる。一方com_m_lesson_scheduleは自分の行しか読めないため、
 * 「未予約数」は自分の担当分しか正確に計算できない。そのため他コーチ分は内訳を出さず、
 * total_sessionsからの残差（合計件数のみ）として扱う。
 */
async function computeStudentContractSessionSummary(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  coachId: string,
  studentId: string,
  licenseId: string,
  ctx: Awaited<ReturnType<typeof getLogContext>>
): Promise<StudentContractSessionSummary | null> {
  const { data: ticket, error: ticketError } = await supabase
    .from('com_t_user_session_ticket')
    .select('ticket_id, total_sessions')
    .eq('license_id', licenseId)
    .maybeSingle();

  if (ticketError || !ticket) {
    if (ticketError) {
      logger.error('coachStudent:get_overview_ticket_failed', ticketError.message, { ...ctx, userId: coachId, payload: { studentId, licenseId } });
    }
    return null;
  }

  const [{ data: sessions, error: sessionsError }, shortfallResult] = await Promise.all([
    supabase
      .from('com_t_session')
      .select('status, ticket_refunded')
      .eq('ticket_id', ticket.ticket_id)
      .eq('coach_id', coachId),
    fetchOwnScheduleShortfalls(supabase, coachId, studentId, ctx),
  ]);

  if (sessionsError) {
    logger.error('coachStudent:get_overview_sessions_failed', sessionsError.message, { ...ctx, userId: coachId, payload: { studentId, ticketId: ticket.ticket_id } });
    return null;
  }
  if ('errorMessage' in shortfallResult) {
    logger.error('coachStudent:get_overview_shortfall_failed', shortfallResult.errorMessage, { ...ctx, userId: coachId, payload: { studentId, ticketId: ticket.ticket_id } });
    return null;
  }

  // fn_schedule_shortfall()の「actual(消化済み扱い)」判定と揃える: 返還なしキャンセルは
  // 再予約不可のセッション枠消化として完了扱いに含める（status=CANCELLEDの1値に
  // 統合されたため、起因(cancel_category)を問わずticket_refunded=falseのみで判定できる）
  let ownScheduled = 0;
  let ownConsumed = 0;
  for (const session of sessions ?? []) {
    if (session.status === SESSION_STATUS.SCHEDULED) {
      ownScheduled += 1;
    } else if (
      SESSION_RESULT_STATUSES.includes(session.status) ||
      (session.status === SESSION_STATUS.CANCELLED && session.ticket_refunded === false)
    ) {
      ownConsumed += 1;
    }
  }

  const ownUnbooked = shortfallResult.shortfalls.reduce((sum, s) => sum + s.shortfall, 0);
  const otherCoachSessions = Math.max(0, ticket.total_sessions - ownScheduled - ownConsumed - ownUnbooked);

  return {
    total_sessions: ticket.total_sessions,
    own_scheduled: ownScheduled,
    own_consumed: ownConsumed,
    own_unbooked: ownUnbooked,
    other_coach_sessions: otherCoachSessions,
  };
}

/**
 * 指定生徒についての、自分（コーチ）のメモ一覧を取得する（新しい順）
 */
export async function getStudentNotesCore(studentId: string): Promise<GetStudentNotesResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: notes, error } = await supabase
      .from('com_t_coach_student_note')
      .select('note_id, coach_id, student_id, note_text, insert_date')
      .eq('coach_id', user.id)
      .eq('student_id', studentId)
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error('coachStudent:get_notes_failed', error.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, notes: notes ?? [] };
  } catch (err) {
    logger.error('coachStudent:get_notes_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * セッション準備/実施ハブ向け。直近days日間の自主トレ実施サマリー（実施日数・延べ問題数・
 * 発話評価回数の合計）を取得する。self_t_sprint（回答内容・個別スコアを含む生ログ）は
 * 参照せず、self_t_sprint_summary（日次件数のみ）に限定することで、生徒の自主トレの
 * 解答内容そのものはコーチに開示しない。
 */
export async function getSelfTrainingWeekSummaryCore(studentId: string, days = 7): Promise<GetSelfTrainingWeekSummaryResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!(await hasCoachStudentRelationship(supabase, user.id, studentId))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('self_t_sprint_summary')
      .select('training_date, question_count, assessment_count')
      .eq('user_id', studentId)
      .gte('training_date', sinceDate);

    if (error) {
      logger.error('coachStudent:get_self_training_summary_failed', error.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const rows = data ?? [];
    const activeDays = new Set(rows.map((r) => r.training_date)).size;
    const totalQuestions = rows.reduce((sum, r) => sum + r.question_count, 0);
    const totalAssessments = rows.reduce((sum, r) => sum + r.assessment_count, 0);

    return {
      success: true,
      summary: { days, active_days: activeDays, total_questions: totalQuestions, total_assessments: totalAssessments },
    };
  } catch (err) {
    logger.error('coachStudent:get_self_training_summary_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒について、自分（コーチ）用のメモを1件追加する
 */
export async function addCoachStudentNoteCore(studentId: string, noteText: string): Promise<AddCoachStudentNoteResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const trimmed = noteText.trim();
    if (!trimmed || trimmed.length > MAX_NOTE_LENGTH) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data, error } = await supabase
      .from('com_t_coach_student_note')
      .insert({ coach_id: user.id, student_id: studentId, note_text: trimmed })
      .select('note_id, coach_id, student_id, note_text, insert_date')
      .single();

    if (error || !data) {
      logger.error('coachStudent:add_note_failed', error?.message ?? 'No row inserted', { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    logger.info('coachStudent:add_note_success', 'Coach student note created', { ...ctx, userId: user.id });
    return { success: true, note: data as CoachStudentNote };
  } catch (err) {
    logger.error('coachStudent:add_note_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

const TRAINING_REPORT_SELECT = 'report_id, ticket_id, student_id, coach_id, comment_text, status, finalized_at, insert_date, update_date';

/** coach_idの並びに対応するuser_nameを解決し、ContractTrainingReport[]へ変換する（見つからない場合は'(Unknown)'） */
async function attachCoachNames(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  rows: Omit<ContractTrainingReport, 'coach_name'>[]
): Promise<ContractTrainingReport[]> {
  if (rows.length === 0) return [];

  const coachIds = Array.from(new Set(rows.map((r) => r.coach_id)));
  const { data: coaches } = await supabase.from('com_m_user').select('id, user_name').in('id', coachIds);
  const nameById = new Map((coaches ?? []).map((c) => [c.id, c.user_name ?? '(Unknown)']));

  return rows.map((r) => ({ ...r, coach_name: nameById.get(r.coach_id) ?? '(Unknown)' }));
}

/**
 * 指定生徒について、自分から参照可能なトレーニングレポートを全件取得する（新しい順）。
 * RLSにより、自分が記入した行(draft/finalizedいずれも)と、他コーチのfinalized済みの行のみが
 * 返る（他コーチのdraftは不可視）。契約(ticket)単位の表示への組み立てはUI側で行う。
 */
export async function getContractTrainingReportsCore(studentId: string): Promise<GetContractTrainingReportsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_contract_training_report')
      .select(TRAINING_REPORT_SELECT)
      .eq('student_id', studentId)
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error('coachStudent:get_training_reports_failed', error.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const reports = await attachCoachNames(supabase, (data ?? []) as Omit<ContractTrainingReport, 'coach_name'>[]);
    return { success: true, reports };
  } catch (err) {
    logger.error('coachStudent:get_training_reports_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定契約(ticket)について、自分(コーチ)のトレーニングレポートの下書きを保存する。
 * 既存のdraft行があれば本文を更新、なければ新規作成する（UNIQUE(ticket_id, coach_id)）。
 * すでにfinalized済みの行がある場合はRLSの更新ポリシー(status=1のみ)により更新が
 * 素通りせず0件更新となるため、その場合はalready_finalizedを返す。
 */
export async function saveContractTrainingReportDraftCore(
  ticketId: string,
  studentId: string,
  commentText: string
): Promise<SaveContractTrainingReportDraftResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const trimmed = commentText.trim();
    if (!trimmed || trimmed.length > MAX_TRAINING_REPORT_LENGTH) {
      return { success: false, errorCode: 'invalid_input' };
    }

    // 現役の担当関係が必要（コーチ交代後の過去コーチは新規に下書きを始められない）
    const { data: relationship } = await supabase
      .from('com_m_coach_student_relationship')
      .select('relationship_id')
      .eq('coach_id', user.id)
      .eq('student_id', studentId)
      .eq('is_active', true)
      .limit(1);
    if (!relationship || relationship.length === 0) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: existing } = await supabase
      .from('com_t_contract_training_report')
      .select('report_id, status')
      .eq('ticket_id', ticketId)
      .eq('coach_id', user.id)
      .maybeSingle();

    if (existing && existing.status !== TRAINING_REPORT_STATUS.DRAFT) {
      return { success: false, errorCode: 'already_finalized' };
    }

    const { data, error } = existing
      ? await supabase
          .from('com_t_contract_training_report')
          .update({ comment_text: trimmed, update_date: new Date().toISOString() })
          .eq('report_id', existing.report_id)
          .select(TRAINING_REPORT_SELECT)
          .single()
      : await supabase
          .from('com_t_contract_training_report')
          .insert({ ticket_id: ticketId, student_id: studentId, coach_id: user.id, comment_text: trimmed })
          .select(TRAINING_REPORT_SELECT)
          .single();

    if (error || !data) {
      logger.error('coachStudent:save_training_report_draft_failed', error?.message ?? 'No row returned', { ...ctx, userId: user.id, payload: { ticketId, studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const [report] = await attachCoachNames(supabase, [data as Omit<ContractTrainingReport, 'coach_name'>]);
    logger.info('coachStudent:save_training_report_draft_success', 'Training report draft saved', { ...ctx, userId: user.id });
    return { success: true, report };
  } catch (err) {
    logger.error('coachStudent:save_training_report_draft_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 自分(コーチ)のトレーニングレポートを確定(finalized)する。確定後は編集不可になる。
 * RLSの更新ポリシー(status=1のみ更新可)により、すでに確定済みの行や他コーチの行に対しては
 * 0件更新となるため、その場合はalready_finalizedを返す。
 */
export async function finalizeContractTrainingReportCore(reportId: string): Promise<FinalizeContractTrainingReportResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_contract_training_report')
      .update({ status: TRAINING_REPORT_STATUS.FINALIZED, finalized_at: new Date().toISOString(), update_date: new Date().toISOString() })
      .eq('report_id', reportId)
      .select(TRAINING_REPORT_SELECT)
      .maybeSingle();

    if (error) {
      logger.error('coachStudent:finalize_training_report_failed', error.message, { ...ctx, userId: user.id, payload: { reportId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!data) {
      // RLSにより対象外(他コーチの行/既に確定済み/存在しない)だった
      return { success: false, errorCode: 'already_finalized' };
    }

    const [report] = await attachCoachNames(supabase, [data as Omit<ContractTrainingReport, 'coach_name'>]);
    logger.info('coachStudent:finalize_training_report_success', 'Training report finalized', { ...ctx, userId: user.id });
    return { success: true, report };
  } catch (err) {
    logger.error('coachStudent:finalize_training_report_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒の、指定した問題種別1つのレベルを引き上げる（コーチ向け）。
 * レベルは常に「上げる」方向のみ許可し、更新後は computeStage() でstageを再計算して一致させる
 * （個別種別のレベルアップだけで次ステージの条件を満たした場合、自動的にステージも進む）。
 */
export async function updateStudentSprintLevelCore(
  studentId: string,
  questionType: SprintQuestionType,
  newLevel: number
): Promise<UpdateStudentSprintProgressResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!(await hasCoachStudentRelationship(supabase, user.id, studentId))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: current, error: fetchError } = await supabase
      .from('student_m_sprint_progress')
      .select('stage, level_speed, level_structure, level_builders, level_mastery')
      .eq('user_id', studentId)
      .maybeSingle();

    if (fetchError) {
      logger.error('coachStudent:update_level_fetch_failed', fetchError.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const currentProgress: StudentSprintProgress = {
      stage: current?.stage ?? 0,
      level_speed: current?.level_speed ?? 0,
      level_structure: current?.level_structure ?? 0,
      level_builders: current?.level_builders ?? 0,
      level_mastery: current?.level_mastery ?? 0,
    };

    const typeMeta = QUESTION_TYPES[questionType];
    const currentLevel = toStageLevels(currentProgress)[questionType];
    const clampedLevel = clampLevel(questionType, newLevel);

    // レベルは「上げる」方向のみ許可（範囲外・現状以下の値は不正入力として拒否）
    if (!Number.isInteger(newLevel) || clampedLevel !== newLevel || newLevel <= currentLevel) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const newLevels = { ...toStageLevels(currentProgress), [questionType]: newLevel };
    const newStage = computeStage(newLevels);

    const { data: updated, error: updateError } = await supabase
      .from('student_m_sprint_progress')
      .update({ [typeMeta.dbKey]: newLevel, stage: newStage, update_date: new Date().toISOString() })
      .eq('user_id', studentId)
      .select('stage, level_speed, level_structure, level_builders, level_mastery')
      .single();

    if (updateError || !updated) {
      logger.error('coachStudent:update_level_failed', updateError?.message ?? 'No row updated', { ...ctx, userId: user.id, payload: { studentId, questionType, newLevel } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    logger.info('coachStudent:update_level_success', 'Student sprint level updated', { ...ctx, userId: user.id, payload: { studentId, questionType, newLevel, newStage } });
    return { success: true, progress: updated as StudentSprintProgress };
  } catch (err) {
    logger.error('coachStudent:update_level_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒を、指定ステージへ強制的に到達させる（コーチ向け）。
 * 既に到達条件を満たしている問題種別のレベルは変更せず、不足している種別のみ必要値まで底上げする。
 */
export async function forceStageUpStudentCore(
  studentId: string,
  targetStage: number
): Promise<UpdateStudentSprintProgressResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!(await hasCoachStudentRelationship(supabase, user.id, studentId))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: current, error: fetchError } = await supabase
      .from('student_m_sprint_progress')
      .select('stage, level_speed, level_structure, level_builders, level_mastery')
      .eq('user_id', studentId)
      .maybeSingle();

    if (fetchError) {
      logger.error('coachStudent:force_stage_up_fetch_failed', fetchError.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const currentProgress: StudentSprintProgress = {
      stage: current?.stage ?? 0,
      level_speed: current?.level_speed ?? 0,
      level_structure: current?.level_structure ?? 0,
      level_builders: current?.level_builders ?? 0,
      level_mastery: current?.level_mastery ?? 0,
    };

    // ステージも「上げる」方向のみ許可
    if (!Number.isInteger(targetStage) || targetStage <= currentProgress.stage || targetStage > MAX_STAGE) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const forcedLevels = getForcedLevels(targetStage, toStageLevels(currentProgress));
    const newStage = computeStage(forcedLevels);

    const { data: updated, error: updateError } = await supabase
      .from('student_m_sprint_progress')
      .update({
        level_speed: forcedLevels['0'],
        level_structure: forcedLevels['4'],
        level_builders: forcedLevels['5'],
        level_mastery: forcedLevels['6'],
        stage: newStage,
        update_date: new Date().toISOString(),
      })
      .eq('user_id', studentId)
      .select('stage, level_speed, level_structure, level_builders, level_mastery')
      .single();

    if (updateError || !updated) {
      logger.error('coachStudent:force_stage_up_failed', updateError?.message ?? 'No row updated', { ...ctx, userId: user.id, payload: { studentId, targetStage } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    logger.info('coachStudent:force_stage_up_success', 'Student stage forced up', { ...ctx, userId: user.id, payload: { studentId, targetStage, newStage } });
    return { success: true, progress: updated as StudentSprintProgress };
  } catch (err) {
    logger.error('coachStudent:force_stage_up_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
