'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import {
  AssignedStudentSummary,
  CoachStudentNote,
  GetAssignedStudentsResult,
  GetStudentOverviewResult,
  GetStudentSessionHistoryResult,
  GetStudentNotesResult,
  AddCoachStudentNoteResult,
} from '@gabby/types/coachStudent';

const logger = createLogger('common');
const MAX_NOTE_LENGTH = 4000;

/**
 * ログイン中コーチが指定の生徒と担当関係を持つか判定する。
 * com_m_lesson_scheduleはstatusを問わず判定する（コーチ交代後も、過去に担当した
 * コーチが引き継ぎ目的でStudent Overviewを閲覧できるようにするため）。
 */
export async function hasCoachStudentRelationship(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  coachId: string,
  studentId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('com_m_lesson_schedule')
    .select('schedule_id')
    .eq('coach_id', coachId)
    .eq('student_id', studentId)
    .limit(1);
  return Boolean(data && data.length > 0);
}

/**
 * ログイン中コーチに現在アクティブに割り当てられている生徒の一覧を取得する（コーチ向け）
 * ダッシュボードの担当生徒プレビューおよび生徒一覧画面で使用する。
 */
export async function getAssignedStudentsCore(): Promise<GetAssignedStudentsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: schedules, error } = await supabase
      .from('com_m_lesson_schedule')
      .select('student_id')
      .eq('coach_id', user.id)
      .eq('status', 1);

    if (error) {
      logger.error('coachStudent:get_assigned_students_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!schedules || schedules.length === 0) {
      return { success: true, students: [] };
    }

    const slotCountByStudent = new Map<string, number>();
    for (const s of schedules) {
      slotCountByStudent.set(s.student_id, (slotCountByStudent.get(s.student_id) ?? 0) + 1);
    }
    const studentIds = Array.from(slotCountByStudent.keys());

    const [{ data: users, error: userError }, { data: progress, error: progressError }] = await Promise.all([
      supabase.from('com_m_user').select('id, user_name, icon_path').in('id', studentIds),
      supabase
        .from('student_m_sprint_progress')
        .select('user_id, stage, level_speed, level_structure, level_builders, level_mastery')
        .in('user_id', studentIds),
    ]);

    if (userError || progressError) {
      logger.error(
        'coachStudent:get_assigned_students_join_failed',
        userError?.message ?? progressError?.message ?? 'unknown',
        { ...ctx, userId: user.id }
      );
      return { success: false, errorCode: 'unexpected_error' };
    }

    const userById = new Map((users ?? []).map((u) => [u.id, u]));
    const progressByStudent = new Map((progress ?? []).map((p) => [p.user_id, p]));

    const students: AssignedStudentSummary[] = studentIds
      .map((studentId) => {
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
        };
      })
      .sort((a, b) => a.user_name.localeCompare(b.user_name));

    return { success: true, students };
  } catch (err) {
    logger.error('coachStudent:get_assigned_students_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * Student Overview画面向けに、指定生徒の基本情報とスプリント進捗を取得する（コーチ向け）
 * 担当関係（現在または過去のcom_m_lesson_schedule）がない生徒IDが指定された場合は forbidden を返す。
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

    const [{ data: student, error: userError }, { data: progress, error: progressError }] = await Promise.all([
      supabase.from('com_m_user').select('id, user_name, icon_path, timezone').eq('id', studentId).maybeSingle(),
      supabase
        .from('student_m_sprint_progress')
        .select('stage, level_speed, level_structure, level_builders, level_mastery')
        .eq('user_id', studentId)
        .maybeSingle(),
    ]);

    if (userError || progressError) {
      logger.error(
        'coachStudent:get_overview_failed',
        userError?.message ?? progressError?.message ?? 'unknown',
        { ...ctx, userId: user.id, payload: { studentId } }
      );
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!student) {
      return { success: false, errorCode: 'forbidden' };
    }

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
      },
    };
  } catch (err) {
    logger.error('coachStudent:get_overview_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒との、自分（コーチ）のライブセッション履歴を取得する（コーチ向け、直近50件・新しい順）
 */
export async function getStudentSessionHistoryCore(studentId: string): Promise<GetStudentSessionHistoryResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: sessions, error } = await supabase
      .from('com_t_session')
      .select('session_id, start_datetime, end_datetime, status, rescheduled_from, cancel_reason')
      .eq('coach_id', user.id)
      .eq('student_id', studentId)
      .order('start_datetime', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('coachStudent:get_session_history_failed', error.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, sessions: sessions ?? [] };
  } catch (err) {
    logger.error('coachStudent:get_session_history_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
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
