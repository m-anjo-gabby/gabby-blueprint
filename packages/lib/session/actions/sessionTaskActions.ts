'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import {
  CoachLiveSessionShortfallItem,
  CoachSessionTasksSummary,
  GetCoachSessionTasksResult,
  MissingHomeworkTask,
  SESSION_STATUS,
  UnfinalizedSessionTask,
} from '@gabby/types/session';

const logger = createLogger('common');

// 宿題未提供タスクは、これより古い実施分まで無限に出し続けても実用性が薄いため、
// 直近の実施分のみを対象にする（終了予定時刻超過タスクは実施記録の正確性に関わるため期限を設けない）。
const MISSING_HOMEWORK_LOOKBACK_DAYS = 14;

type ScheduleShortfallRpcRow = { expected_sessions: number; actual_sessions: number; shortfall: number };

/**
 * ダッシュボードの"Session Tasks"パネル向けに、コーチが対応すべき3種類の項目を横断して取得する。
 * 専用テーブルは持たず、都度この3クエリで導出する（詳細はpackages/types/session.tsのコメント参照）。
 */
export async function getCoachSessionTasksCore(): Promise<GetCoachSessionTasksResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const nowIso = new Date().toISOString();
    const lookbackIso = new Date(Date.now() - MISSING_HOMEWORK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: unfinalizedRows, error: unfinalizedError },
      { data: candidateRows, error: candidateError },
      { data: schedules, error: scheduleError },
    ] = await Promise.all([
      supabase
        .from('com_t_session')
        .select('session_id, student_id, start_datetime, end_datetime')
        .eq('coach_id', user.id)
        .eq('status', SESSION_STATUS.SCHEDULED)
        .lt('end_datetime', nowIso)
        .order('end_datetime', { ascending: true }),
      supabase
        .from('com_t_session')
        .select('session_id, student_id, start_datetime, status, com_t_session_homework(homework_id)')
        .eq('coach_id', user.id)
        .in('status', [SESSION_STATUS.COMPLETED, SESSION_STATUS.NO_SHOW, SESSION_STATUS.EARLY_ENDED])
        .gte('end_datetime', lookbackIso)
        .order('start_datetime', { ascending: false }),
      supabase
        .from('com_m_lesson_schedule')
        .select('schedule_id, student_id, day_of_week, start_time')
        .eq('coach_id', user.id)
        .eq('status', 1),
    ]);

    if (unfinalizedError || candidateError || scheduleError) {
      logger.error(
        'session:get_coach_tasks_failed',
        unfinalizedError?.message ?? candidateError?.message ?? scheduleError?.message ?? 'unknown error',
        { ...ctx, userId: user.id }
      );
      return { success: false, errorCode: 'unexpected_error' };
    }

    // com_t_session_homework.session_idにUNIQUE制約があるため、PostgRESTはこの埋め込みを
    // 配列ではなく単一オブジェクト(またはnull)として返す（1宿題=1セッションの1:1関係）。
    // 生成済みDB型定義がこのUNIQUE制約適用前のもの（配列型）である間はas unknownで橋渡しする。
    const missingHomeworkRows = (candidateRows ?? []).filter((row) => {
      const attached = row.com_t_session_homework as unknown as { homework_id: string } | null;
      return !attached;
    });

    const shortfallResults = await Promise.all(
      (schedules ?? []).map((schedule) => supabase.rpc('fn_schedule_shortfall', { p_schedule_id: schedule.schedule_id }).single())
    );

    const shortfallCandidates = (schedules ?? [])
      .map((schedule, index) => {
        const { data, error } = shortfallResults[index];
        if (error || !data) {
          logger.error('session:get_coach_tasks_shortfall_failed', error?.message ?? 'no row returned', {
            ...ctx,
            userId: user.id,
            payload: { scheduleId: schedule.schedule_id },
          });
          return null;
        }
        const row = data as ScheduleShortfallRpcRow;
        return row.shortfall > 0 ? { schedule, row } : null;
      })
      .filter((v): v is { schedule: NonNullable<typeof schedules>[number]; row: ScheduleShortfallRpcRow } => v !== null);

    // 3クエリ分のstudent_idをまとめて1回で解決する
    const studentIds = new Set<string>();
    for (const r of unfinalizedRows ?? []) studentIds.add(r.student_id);
    for (const r of missingHomeworkRows) studentIds.add(r.student_id);
    for (const { schedule } of shortfallCandidates) studentIds.add(schedule.student_id);

    const { data: students, error: studentsError } = studentIds.size > 0
      ? await supabase.from('com_m_user').select('id, user_name').in('id', Array.from(studentIds))
      : { data: [] as { id: string; user_name: string | null }[], error: null };

    if (studentsError) {
      logger.error('session:get_coach_tasks_students_failed', studentsError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const nameById = new Map((students ?? []).map((s) => [s.id, s.user_name ?? '(Unknown)']));

    const unfinalizedSessions: UnfinalizedSessionTask[] = (unfinalizedRows ?? []).map((r) => ({
      session_id: r.session_id,
      student_id: r.student_id,
      student_name: nameById.get(r.student_id) ?? '(Unknown)',
      start_datetime: r.start_datetime,
      end_datetime: r.end_datetime,
    }));

    const missingHomeworkSessions: MissingHomeworkTask[] = missingHomeworkRows.map((r) => ({
      session_id: r.session_id,
      student_id: r.student_id,
      student_name: nameById.get(r.student_id) ?? '(Unknown)',
      start_datetime: r.start_datetime,
      status: r.status,
    }));

    const shortfalls: CoachLiveSessionShortfallItem[] = shortfallCandidates.map(({ schedule, row }) => ({
      schedule_id: schedule.schedule_id,
      student_id: schedule.student_id,
      student_name: nameById.get(schedule.student_id) ?? '(Unknown)',
      day_of_week: schedule.day_of_week,
      start_time: schedule.start_time,
      expected_sessions: row.expected_sessions,
      actual_sessions: row.actual_sessions,
      shortfall: row.shortfall,
    }));

    const tasks: CoachSessionTasksSummary = { unfinalizedSessions, missingHomeworkSessions, shortfalls };
    return { success: true, tasks };
  } catch (err) {
    logger.error('session:get_coach_tasks_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
