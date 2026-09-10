'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  AddSessionHomeworkResult,
  GetSessionHomeworkResult,
  PendingHomeworkAttachment,
  SessionHomeworkEntry,
} from '@gabby/types/sessionHomework';

const logger = createLogger('common');

const HOMEWORK_SELECT_WITH_ATTACHMENTS = '*, com_t_session_homework_attachment(*)';

function normalizeHomeworkRow(row: Omit<SessionHomeworkEntry, 'attachments'> & {
  com_t_session_homework_attachment?: SessionHomeworkEntry['attachments'] | null;
}): SessionHomeworkEntry {
  const { com_t_session_homework_attachment, ...rest } = row;
  return { ...rest, attachments: com_t_session_homework_attachment ?? [] };
}

/**
 * 指定session_idの宿題投稿一覧を取得する（コーチ本人・対象生徒本人・管理者のみRLSにより閲覧可能）
 */
export async function getSessionHomeworkCore(sessionId: string): Promise<GetSessionHomeworkResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_homework')
      .select(HOMEWORK_SELECT_WITH_ATTACHMENTS)
      .eq('session_id', sessionId)
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error('sessionHomework:get_homework_failed', error.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, entries: (data ?? []).map(normalizeHomeworkRow) };
  } catch (err) {
    logger.error('sessionHomework:get_homework_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * セッション準備/実施ハブ向け。指定セッションを除く、直近の宿題投稿を新しい順に取得する
 * （「前回の宿題」を通話前に振り返れるようにするため）。
 */
export async function getRecentSessionHomeworkCore(
  studentId: string,
  excludeSessionId: string,
  limit = 3
): Promise<GetSessionHomeworkResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_homework')
      .select(HOMEWORK_SELECT_WITH_ATTACHMENTS)
      .eq('coach_id', user.id)
      .eq('student_id', studentId)
      .neq('session_id', excludeSessionId)
      .order('insert_date', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('sessionHomework:get_recent_homework_failed', error.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, entries: (data ?? []).map(normalizeHomeworkRow) };
  } catch (err) {
    logger.error('sessionHomework:get_recent_homework_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 宿題を投稿する（コーチのみ）。session_idからcoach_id/student_idをサーバー側で解決し、
 * ログイン中コーチが対象セッションの担当コーチであることを検証してから投稿する
 * （RLSのINSERT WITH CHECKでも同等の検証が行われるが、ここでも明示的にチェックして
 * わかりやすいエラーを返す）。添付ファイルは事前にuploadSessionHomeworkAttachmentで
 * アップロード済みのPendingHomeworkAttachment配列を受け取る。
 */
export async function addSessionHomeworkCore(
  sessionId: string,
  homeworkText: string,
  attachments: PendingHomeworkAttachment[] = []
): Promise<AddSessionHomeworkResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const trimmed = homeworkText.trim();
    if (!trimmed && attachments.length === 0) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data: session, error: sessionError } = await supabase
      .from('com_t_session')
      .select('coach_id, student_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      logger.error('sessionHomework:add_homework_session_lookup_failed', sessionError?.message ?? 'session not found', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (session.coach_id !== user.id) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: homeworkRow, error } = await supabase
      .from('com_t_session_homework')
      .insert({
        session_id: sessionId,
        coach_id: user.id,
        student_id: session.student_id,
        homework_text: trimmed,
      })
      .select('*')
      .single();

    if (error || !homeworkRow) {
      logger.error('sessionHomework:add_homework_failed', error?.message ?? 'No row inserted', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    if (attachments.length > 0) {
      const { data: attachmentRows, error: attachmentError } = await supabase
        .from('com_t_session_homework_attachment')
        .insert(
          attachments.map((a) => ({
            homework_id: homeworkRow.homework_id,
            file_path: a.file_path,
            file_name: a.file_name,
            file_type: a.file_type,
            file_size: a.file_size,
          }))
        )
        .select('*');

      if (attachmentError) {
        logger.error('sessionHomework:add_homework_attachments_failed', attachmentError.message, {
          ...ctx,
          userId: user.id,
          payload: { sessionId, homeworkId: homeworkRow.homework_id },
        });
        return { success: true, entry: { ...homeworkRow, attachments: [] } as SessionHomeworkEntry };
      }

      logger.info('sessionHomework:add_homework_success', 'Homework posted', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: true, entry: { ...homeworkRow, attachments: attachmentRows } as SessionHomeworkEntry };
    }

    logger.info('sessionHomework:add_homework_success', 'Homework posted', { ...ctx, userId: user.id, payload: { sessionId } });
    return { success: true, entry: { ...homeworkRow, attachments: [] } as SessionHomeworkEntry };
  } catch (err) {
    logger.error('sessionHomework:add_homework_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
