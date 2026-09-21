'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { hasCoachStudentRelationship } from './coachStudentActions';
import {
  DialogueAssignmentSummary,
  DialogueCategory,
  DialogueContentSummary,
  GetAvailableDialogueContentsResult,
  AssignDialogueContentResult,
  UnassignDialogueContentResult,
  GetStudentDialogueAssignmentsResult,
  UpdateDialogueSessionProgressInput,
  UpdateDialogueSessionProgressResult,
} from '@gabby/types/dialogue';

const logger = createLogger('common');

const DIALOGUE_SESSION_SELECT =
  'dialogue_session_id, content_id, session_no, coach_slides_title, coach_slides_link, student_slides_title, student_slides_link';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * コーチがダイアログプラクティスの教材として選択できるセット一覧を取得する
 * (content_type=3。可視範囲はcom_m_contentsのRLSに委ねる: 汎用は全員、コーパスは
 * 担当生徒のクライアントに紐づくものだけがcontent_scope=1経由で返る)
 */
export async function getAvailableDialogueContentsCore(): Promise<GetAvailableDialogueContentsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: contents, error: contentsError } = await supabase
      .from('com_m_contents')
      .select('content_id, content_name, content_name_en, category_id')
      .eq('content_type', 3)
      .eq('delete_flg', '0')
      .order('category_id', { ascending: true })
      .order('seq_no', { ascending: true });

    if (contentsError) {
      logger.error('dialogue:get_contents_failed', contentsError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    if (!contents || contents.length === 0) {
      return { success: true, contents: [] };
    }

    const contentIds = contents.map((c) => c.content_id);

    const { data: sessions, error: sessionsError } = await supabase
      .from('com_m_dialogue_session')
      .select('content_id, session_no, coach_slides_link')
      .in('content_id', contentIds)
      .eq('delete_flg', '0');

    if (sessionsError) {
      logger.error('dialogue:get_contents_session_count_failed', sessionsError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const sessionCountByContent = new Map<string, number>();
    const session1LinkByContent = new Map<string, string | null>();
    (sessions ?? []).forEach((s) => {
      sessionCountByContent.set(s.content_id, (sessionCountByContent.get(s.content_id) ?? 0) + 1);
      if (s.session_no === 1) {
        session1LinkByContent.set(s.content_id, s.coach_slides_link);
      }
    });

    const result: DialogueContentSummary[] = contents.map((c) => ({
      content_id: c.content_id,
      content_name: c.content_name,
      content_name_en: c.content_name_en,
      category_id: c.category_id as DialogueCategory,
      session_count: sessionCountByContent.get(c.content_id) ?? 0,
      session1_coach_slides_link: session1LinkByContent.get(c.content_id) ?? null,
    }));

    return { success: true, contents: result };
  } catch (err) {
    logger.error('dialogue:get_contents_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * コーチが担当生徒にダイアログ教材セットを割り当てる。
 * 過去に割り当てて解除済み(delete_flg='1')の行があれば再割当として復活させる
 * （部分ユニークインデックスidx_dialogue_assignment_unique_activeとの整合のため）。
 */
export async function assignDialogueContentCore(
  studentId: string,
  contentId: string
): Promise<AssignDialogueContentResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!(await hasCoachStudentRelationship(supabase, user.id, studentId))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: existing, error: existingError } = await supabase
      .from('com_t_dialogue_assignment')
      .select('assignment_id, delete_flg')
      .eq('student_id', studentId)
      .eq('content_id', contentId)
      .maybeSingle();

    if (existingError) {
      logger.error('dialogue:assign_lookup_failed', existingError.message, { ...ctx, userId: user.id, payload: { studentId, contentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    if (existing) {
      if (existing.delete_flg === '0') {
        // 既に割当済み。冪等に成功扱いとする
        return { success: true, assignment_id: existing.assignment_id };
      }

      const { error: reactivateError } = await supabase
        .from('com_t_dialogue_assignment')
        .update({
          delete_flg: '0',
          assigned_by_coach_id: user.id,
          assigned_date: today(),
          update_date: new Date().toISOString(),
        })
        .eq('assignment_id', existing.assignment_id);

      if (reactivateError) {
        logger.error('dialogue:assign_reactivate_failed', reactivateError.message, { ...ctx, userId: user.id, payload: { studentId, contentId } });
        return { success: false, errorCode: 'unexpected_error' };
      }

      return { success: true, assignment_id: existing.assignment_id };
    }

    const { data, error } = await supabase
      .from('com_t_dialogue_assignment')
      .insert({
        student_id: studentId,
        content_id: contentId,
        assigned_by_coach_id: user.id,
      })
      .select('assignment_id')
      .single();

    if (error || !data) {
      logger.error('dialogue:assign_failed', error?.message ?? 'No row inserted', { ...ctx, userId: user.id, payload: { studentId, contentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    logger.info('dialogue:assign_success', 'Dialogue content assigned', { ...ctx, userId: user.id, payload: { studentId, contentId, assignmentId: data.assignment_id } });
    return { success: true, assignment_id: data.assignment_id };
  } catch (err) {
    logger.error('dialogue:assign_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 割り当て済みのダイアログ教材セットを解除する（論理削除。再割当は別途assignDialogueContentCoreで可能）。
 * 完了済みセッションが1件でもある場合は、進捗記録を失わせないよう解除を拒否する
 * （UI側でも解除ボタンをdisabledにしているが、直接呼び出し・競合更新への防御として
 * サーバー側でも同じ条件を再検証する）。
 */
export async function unassignDialogueContentCore(assignmentId: string): Promise<UnassignDialogueContentResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: assignment, error: fetchError } = await supabase
      .from('com_t_dialogue_assignment')
      .select('assignment_id, student_id')
      .eq('assignment_id', assignmentId)
      .maybeSingle();

    if (fetchError) {
      logger.error('dialogue:unassign_lookup_failed', fetchError.message, { ...ctx, userId: user.id, payload: { assignmentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!assignment) {
      return { success: false, errorCode: 'forbidden' };
    }
    if (!(await hasCoachStudentRelationship(supabase, user.id, assignment.student_id))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: completedProgress, error: progressCheckError } = await supabase
      .from('com_t_dialogue_session_progress')
      .select('progress_id')
      .eq('assignment_id', assignmentId)
      .eq('is_completed', true)
      .limit(1);

    if (progressCheckError) {
      logger.error('dialogue:unassign_progress_check_failed', progressCheckError.message, { ...ctx, userId: user.id, payload: { assignmentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (completedProgress && completedProgress.length > 0) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { error } = await supabase
      .from('com_t_dialogue_assignment')
      .update({ delete_flg: '1', update_date: new Date().toISOString() })
      .eq('assignment_id', assignmentId);

    if (error) {
      logger.error('dialogue:unassign_failed', error.message, { ...ctx, userId: user.id, payload: { assignmentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true };
  } catch (err) {
    logger.error('dialogue:unassign_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒に割り当てられているダイアログ教材セットと、セッション別の進捗をまとめて取得する
 */
export async function getStudentDialogueAssignmentsCore(studentId: string): Promise<GetStudentDialogueAssignmentsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!(await hasCoachStudentRelationship(supabase, user.id, studentId))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from('com_t_dialogue_assignment')
      .select('assignment_id, content_id, assigned_by_coach_id, assigned_date, com_m_contents(content_name, content_name_en, category_id)')
      .eq('student_id', studentId)
      .eq('delete_flg', '0')
      .order('assigned_date', { ascending: false });

    if (assignmentsError) {
      logger.error('dialogue:get_assignments_failed', assignmentsError.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    if (!assignments || assignments.length === 0) {
      return { success: true, assignments: [] };
    }

    const contentIds = assignments.map((a) => a.content_id);
    const assignmentIds = assignments.map((a) => a.assignment_id);

    const { data: sessions, error: sessionsError } = await supabase
      .from('com_m_dialogue_session')
      .select(DIALOGUE_SESSION_SELECT)
      .in('content_id', contentIds)
      .eq('delete_flg', '0')
      .order('session_no', { ascending: true });

    if (sessionsError) {
      logger.error('dialogue:get_assignments_sessions_failed', sessionsError.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const { data: progressRows, error: progressError } = await supabase
      .from('com_t_dialogue_session_progress')
      .select('assignment_id, dialogue_session_id, is_completed, completed_date, notes')
      .in('assignment_id', assignmentIds);

    if (progressError) {
      logger.error('dialogue:get_assignments_progress_failed', progressError.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const sessionsByContent = new Map<string, typeof sessions>();
    (sessions ?? []).forEach((s) => {
      if (!sessionsByContent.has(s.content_id)) sessionsByContent.set(s.content_id, []);
      sessionsByContent.get(s.content_id)!.push(s);
    });

    const progressByKey = new Map<string, { is_completed: boolean; completed_date: string | null; notes: string | null }>();
    (progressRows ?? []).forEach((p) => {
      progressByKey.set(`${p.assignment_id}:${p.dialogue_session_id}`, {
        is_completed: p.is_completed,
        completed_date: p.completed_date,
        notes: p.notes,
      });
    });

    const result: DialogueAssignmentSummary[] = assignments.map((a) => {
      const contentJoin = Array.isArray(a.com_m_contents) ? a.com_m_contents[0] : a.com_m_contents;
      const contentSessions = sessionsByContent.get(a.content_id) ?? [];

      const sessionViews = contentSessions.map((s) => {
        const progress = progressByKey.get(`${a.assignment_id}:${s.dialogue_session_id}`);
        return {
          dialogue_session_id: s.dialogue_session_id,
          session_no: s.session_no,
          coach_slides_title: s.coach_slides_title,
          coach_slides_link: s.coach_slides_link,
          student_slides_title: s.student_slides_title,
          student_slides_link: s.student_slides_link,
          is_completed: progress?.is_completed ?? false,
          completed_date: progress?.completed_date ?? null,
          notes: progress?.notes ?? null,
        };
      });

      const completedCount = sessionViews.filter((s) => s.is_completed).length;

      return {
        assignment_id: a.assignment_id,
        content_id: a.content_id,
        content_name: contentJoin?.content_name ?? '(Unknown)',
        content_name_en: contentJoin?.content_name_en ?? null,
        category_id: (contentJoin?.category_id ?? 1) as DialogueCategory,
        assigned_by_coach_id: a.assigned_by_coach_id,
        assigned_date: a.assigned_date,
        sessions: sessionViews,
        completed_session_count: completedCount,
        total_session_count: sessionViews.length,
        is_set_completed: sessionViews.length > 0 && completedCount === sessionViews.length,
      };
    });

    return { success: true, assignments: result };
  } catch (err) {
    logger.error('dialogue:get_assignments_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ダイアログプラクティスのセッション進捗（完了状態・メモ）を更新する（行が無ければ新規作成）。
 * completed_dateは「未完了→完了」に変わった時だけ当日日付を採番し、完了状態を保ったままの
 * メモ編集では上書きしない（既存の完了日を保持する）。
 */
export async function updateDialogueSessionProgressCore(
  input: UpdateDialogueSessionProgressInput
): Promise<UpdateDialogueSessionProgressResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: assignment, error: assignmentError } = await supabase
      .from('com_t_dialogue_assignment')
      .select('assignment_id, student_id')
      .eq('assignment_id', input.assignment_id)
      .maybeSingle();

    if (assignmentError) {
      logger.error('dialogue:update_progress_lookup_failed', assignmentError.message, { ...ctx, userId: user.id, payload: input });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!assignment) {
      return { success: false, errorCode: 'forbidden' };
    }
    if (!(await hasCoachStudentRelationship(supabase, user.id, assignment.student_id))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: existingProgress, error: existingProgressError } = await supabase
      .from('com_t_dialogue_session_progress')
      .select('is_completed, completed_date')
      .eq('assignment_id', input.assignment_id)
      .eq('dialogue_session_id', input.dialogue_session_id)
      .maybeSingle();

    if (existingProgressError) {
      logger.error('dialogue:update_progress_existing_lookup_failed', existingProgressError.message, { ...ctx, userId: user.id, payload: input });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const completedDate = input.is_completed
      ? (existingProgress?.is_completed ? existingProgress.completed_date : today())
      : null;
    const trimmedNotes = input.notes?.trim() ?? '';

    const { error } = await supabase
      .from('com_t_dialogue_session_progress')
      .upsert(
        {
          assignment_id: input.assignment_id,
          dialogue_session_id: input.dialogue_session_id,
          is_completed: input.is_completed,
          completed_date: completedDate,
          notes: trimmedNotes.length > 0 ? trimmedNotes : null,
          updated_by_coach_id: user.id,
          update_date: new Date().toISOString(),
        },
        { onConflict: 'assignment_id,dialogue_session_id' }
      );

    if (error) {
      logger.error('dialogue:update_progress_failed', error.message, { ...ctx, userId: user.id, payload: input });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true };
  } catch (err) {
    logger.error('dialogue:update_progress_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
