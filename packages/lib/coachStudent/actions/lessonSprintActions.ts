'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { hasCoachStudentRelationship } from './coachStudentActions';
import {
  CreateLessonSprintResultInput,
  CreateLessonSprintResultResponse,
  GetLessonSprintContentsResult,
  GetLessonSprintDetailResult,
  GetLessonSprintHistoryResult,
  GetLessonSprintQuestionsResult,
  LessonSprintHistoryItem,
  LessonSprintHistoryListItem,
  LessonSprintRecord,
  UpdateLessonSprintSessionNoteResult,
} from '@gabby/types/lessonSprint';
import { SprintQuestion, SprintQuestionType } from '@gabby/types/sprint';

const logger = createLogger('common');

// 生徒アプリの自主トレスプリント（getSprintQuestionsAction）と同じサンプリング件数。
// Lesson Sprintは常に「スプリント」相当の出題数に揃える（ドリル全量モードは持たない）。
const SPRINT_LIMIT_COUNT = 10;
const SPRINT_SPEED_LIMIT_COUNT = 30;

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * コーチがLesson Sprintの教材として選択できるコンテンツ一覧を取得する
 * (content_type=2: Gabbyスプリント教材。可視範囲はcom_m_contentsのRLSに委ねる)
 */
export async function getAvailableSprintContentsCore(): Promise<GetLessonSprintContentsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_m_contents')
      .select('content_id, content_name, metadata')
      .eq('content_type', 2)
      .eq('delete_flg', '0')
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error('lessonSprint:get_contents_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, contents: data ?? [] };
  } catch (err) {
    logger.error('lessonSprint:get_contents_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定条件のスプリント問題をサンプリング取得する（com_m_sprint_questionsは生徒/コーチ共通マスタ）
 * apps/student/actions/sprintAction.ts の getSprintQuestionsAction のロジックを踏襲。
 */
export async function getLessonSprintQuestionsCore(
  contentId: string,
  questionType: SprintQuestionType,
  difficultyLevel: number
): Promise<GetLessonSprintQuestionsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: fetchedData, error } = await supabase
      .from('com_m_sprint_questions')
      .select('*')
      .eq('content_id', contentId)
      .eq('question_type', questionType)
      .eq('difficulty_level', difficultyLevel)
      .eq('delete_flg', '0');

    if (error) {
      logger.error('lessonSprint:get_questions_failed', error.message, { ...ctx, userId: user.id, payload: { contentId, questionType, difficultyLevel } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const rawRows = (fetchedData as SprintQuestion[]) ?? [];
    if (rawRows.length === 0) {
      return { success: true, questions: [] };
    }

    let finalData: SprintQuestion[] = [];

    if (questionType === '0') {
      finalData = shuffleArray(rawRows).slice(0, SPRINT_SPEED_LIMIT_COUNT);
    } else {
      const allUniqueGroupIds = Array.from(new Set(rawRows.map((item) => item.group_id).filter(Boolean))) as string[];
      const targetGroupIds = shuffleArray(allUniqueGroupIds).slice(0, SPRINT_LIMIT_COUNT);

      const groupMap = new Map<string, SprintQuestion[]>();
      rawRows.forEach((item) => {
        if (!item.group_id) return;
        if (!groupMap.has(item.group_id)) {
          groupMap.set(item.group_id, []);
        }
        groupMap.get(item.group_id)!.push(item);
      });
      groupMap.forEach((questions) => {
        questions.sort((a, b) => (a.seq_no || 0) - (b.seq_no || 0));
      });

      finalData = targetGroupIds.flatMap((groupId) => groupMap.get(groupId) || []);
    }

    return { success: true, questions: finalData };
  } catch (err) {
    logger.error('lessonSprint:get_questions_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * Lesson Sprintの実施結果・履歴を1件登録する
 */
export async function createLessonSprintResultCore(
  input: CreateLessonSprintResultInput
): Promise<CreateLessonSprintResultResponse> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!(await hasCoachStudentRelationship(supabase, user.id, input.student_id))) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data, error } = await supabase
      .from('lesson_t_sprint')
      .insert({
        coach_id: user.id,
        student_id: input.student_id,
        sprint_type: input.sprint_type,
        content_id: input.content_id,
        question_type: input.question_type,
        answer_type: input.answer_type,
        difficulty_level: input.difficulty_level,
        time_limit_sec: input.time_limit_sec,
        total_answered: input.total_answered,
        total_evaluated: input.total_evaluated,
        paused_duration_sec: input.paused_duration_sec,
        session_note: input.session_note,
        answered_history: input.history,
      })
      .select('lesson_sprint_id')
      .single();

    if (error || !data) {
      logger.error('lessonSprint:create_result_failed', error?.message ?? 'No row inserted', { ...ctx, userId: user.id, payload: { studentId: input.student_id } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    logger.info('lessonSprint:create_result_success', 'Lesson sprint result saved', { ...ctx, userId: user.id, payload: { lessonSprintId: data.lesson_sprint_id } });
    return { success: true, lesson_sprint_id: data.lesson_sprint_id };
  } catch (err) {
    logger.error('lessonSprint:create_result_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒との、自分（コーチ）のLesson Sprint実施履歴を取得する（新しい順・直近20件）
 */
export async function getLessonSprintHistoryCore(studentId: string): Promise<GetLessonSprintHistoryResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('lesson_t_sprint')
      .select('lesson_sprint_id, question_type, difficulty_level, total_answered, total_evaluated, answered_history, insert_date, com_m_contents(content_name)')
      .eq('coach_id', user.id)
      .eq('student_id', studentId)
      .order('insert_date', { ascending: false })
      .limit(20);

    if (error) {
      logger.error('lessonSprint:get_history_failed', error.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const records: LessonSprintHistoryListItem[] = (data ?? []).map((row: any) => {
      const history = (row.answered_history as LessonSprintHistoryItem[]) ?? [];
      const scored = history.filter((h) => typeof h.score === 'number');
      const averageScore = scored.length > 0
        ? Math.round((scored.reduce((sum, h) => sum + (h.score ?? 0), 0) / scored.length) * 10) / 10
        : null;
      const contentJoin = Array.isArray(row.com_m_contents) ? row.com_m_contents[0] : row.com_m_contents;

      return {
        lesson_sprint_id: row.lesson_sprint_id,
        content_name: contentJoin?.content_name ?? '(Unknown)',
        question_type: row.question_type,
        difficulty_level: row.difficulty_level,
        total_answered: row.total_answered,
        total_evaluated: row.total_evaluated,
        average_score: averageScore,
        insert_date: row.insert_date,
      };
    });

    return { success: true, records };
  } catch (err) {
    logger.error('lessonSprint:get_history_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * Lesson Sprint結果1件の詳細（当時の出題順に問題マスタを復元したもの）を取得する
 */
export async function getLessonSprintResultCore(lessonSprintId: string): Promise<GetLessonSprintDetailResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: record, error: recordError } = await supabase
      .from('lesson_t_sprint')
      .select('*')
      .eq('lesson_sprint_id', lessonSprintId)
      .eq('coach_id', user.id)
      .maybeSingle();

    if (recordError) {
      logger.error('lessonSprint:get_result_failed', recordError.message, { ...ctx, userId: user.id, payload: { lessonSprintId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!record) {
      return { success: false, errorCode: 'forbidden' };
    }

    const history = (record.answered_history as LessonSprintHistoryItem[]) ?? [];
    if (history.length === 0) {
      return { success: true, record: record as LessonSprintRecord, questions: [] };
    }

    const targetIds = history.map((h) => h.question_id);
    const { data: questionsData, error: qError } = await supabase
      .from('com_m_sprint_questions')
      .select('*')
      .in('question_id', targetIds);

    if (qError) {
      logger.error('lessonSprint:get_result_questions_failed', qError.message, { ...ctx, userId: user.id, payload: { lessonSprintId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const rawQuestions = (questionsData as SprintQuestion[]) ?? [];
    const sortedQuestions = history
      .map((h) => rawQuestions.find((q) => q.question_id === h.question_id))
      .filter((q): q is SprintQuestion => !!q);

    return { success: true, record: record as LessonSprintRecord, questions: sortedQuestions };
  } catch (err) {
    logger.error('lessonSprint:get_result_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * Lesson Sprint結果画面から、担当コーチ自身のセッションノートを更新する
 */
export async function updateLessonSprintSessionNoteCore(
  lessonSprintId: string,
  sessionNote: string | null
): Promise<UpdateLessonSprintSessionNoteResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('lesson_t_sprint')
      .update({ session_note: sessionNote })
      .eq('lesson_sprint_id', lessonSprintId)
      .eq('coach_id', user.id)
      .select('lesson_sprint_id')
      .maybeSingle();

    if (error) {
      logger.error('lessonSprint:update_session_note_failed', error.message, { ...ctx, userId: user.id, payload: { lessonSprintId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!data) {
      return { success: false, errorCode: 'forbidden' };
    }

    return { success: true };
  } catch (err) {
    logger.error('lessonSprint:update_session_note_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
