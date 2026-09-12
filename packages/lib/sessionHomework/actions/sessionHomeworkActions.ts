'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  AddHomeworkCommentResult,
  CreateSessionHomeworkResult,
  GetHomeworkChecklistResult,
  GetRecentSessionHomeworkResult,
  GetSessionHomeworkResult,
  HOMEWORK_CHECKLIST_MAX_ITEMS,
  PendingHomeworkAttachment,
  SessionHomeworkAttachment,
  SessionHomeworkChecklistItem,
  SessionHomeworkComment,
  SessionHomeworkEntry,
  UpdateHomeworkChecklistItemResult,
} from '@gabby/types/sessionHomework';

const logger = createLogger('common');

const ATTACHMENT_SELECT = 'com_t_session_homework_attachment(*)';
const HOMEWORK_SELECT_WITH_COMMENTS = `*, ${ATTACHMENT_SELECT}, com_t_session_homework_comment(*, ${ATTACHMENT_SELECT})`;

type RawAttachmentRow = SessionHomeworkAttachment;
type RawCommentRow = Omit<SessionHomeworkComment, 'attachments'> & { com_t_session_homework_attachment?: RawAttachmentRow[] | null };
type RawHomeworkRow = Omit<SessionHomeworkEntry, 'attachments' | 'comments'> & {
  com_t_session_homework_attachment?: RawAttachmentRow[] | null;
  com_t_session_homework_comment?: RawCommentRow[] | null;
};

function normalizeHomeworkRow(row: RawHomeworkRow): SessionHomeworkEntry {
  const { com_t_session_homework_attachment, com_t_session_homework_comment, ...rest } = row;
  const comments = (com_t_session_homework_comment ?? [])
    .map((c) => {
      const { com_t_session_homework_attachment: commentAttachments, ...commentRest } = c;
      return { ...commentRest, attachments: commentAttachments ?? [] };
    })
    .sort((a, b) => (a.insert_date < b.insert_date ? 1 : -1));

  return { ...rest, attachments: com_t_session_homework_attachment ?? [], comments };
}

/**
 * 指定session_idの宿題本体（チェックリストの親、フォローアップコメントの親）を取得する
 * （コーチ本人・対象生徒本人・管理者のみRLSにより閲覧可能）。1セッション1件のため、
 * 未投稿の場合はhomework: nullを返す。
 */
export async function getSessionHomeworkCore(sessionId: string): Promise<GetSessionHomeworkResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_homework')
      .select(HOMEWORK_SELECT_WITH_COMMENTS)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      logger.error('sessionHomework:get_homework_failed', error.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, homework: data ? normalizeHomeworkRow(data as unknown as RawHomeworkRow) : null };
  } catch (err) {
    logger.error('sessionHomework:get_homework_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * セッション準備/実施ハブ向け。指定セッションを除く、直近の宿題本体を新しい順に取得する
 * （「前回の宿題」を通話前に振り返れるようにするため）。この一覧では本文プレビューと添付のみ
 * 使うため、フォローアップコメントは取得しない（一覧表示を軽量に保つため、comments: []固定）。
 */
export async function getRecentSessionHomeworkCore(
  studentId: string,
  excludeSessionId: string,
  limit = 3
): Promise<GetRecentSessionHomeworkResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_homework')
      .select(`*, ${ATTACHMENT_SELECT}`)
      .eq('coach_id', user.id)
      .eq('student_id', studentId)
      .neq('session_id', excludeSessionId)
      .order('insert_date', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('sessionHomework:get_recent_homework_failed', error.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const entries: SessionHomeworkEntry[] = (data ?? []).map((row) => {
      const { com_t_session_homework_attachment, ...rest } = row as RawHomeworkRow;
      return { ...rest, attachments: com_t_session_homework_attachment ?? [], comments: [] };
    });

    return { success: true, entries };
  } catch (err) {
    logger.error('sessionHomework:get_recent_homework_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 宿題本体を新規作成する（コーチのみ、1セッション1件）。session_idからcoach_id/student_idを
 * サーバー側で解決し、ログイン中コーチが対象セッションの担当コーチであることを検証してから
 * 投稿する（RLSのINSERT WITH CHECKでも同等の検証が行われるが、ここでも明示的にチェックして
 * わかりやすいエラーを返す）。本体テキストと同時に、任意でチェックリスト初期項目・添付ファイル
 * （事前にuploadSessionHomeworkAttachmentでアップロード済み）をまとめて登録する。
 * 既に本体が存在する場合（UNIQUE制約違反）はerrorCode: 'already_exists'を返す。
 */
export async function createSessionHomeworkCore(
  sessionId: string,
  homeworkText: string,
  attachments: PendingHomeworkAttachment[] = [],
  initialChecklistItemTexts: string[] = []
): Promise<CreateSessionHomeworkResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const trimmedText = homeworkText.trim();
    if (!trimmedText) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const trimmedChecklistTexts = initialChecklistItemTexts.map((t) => t.trim()).filter((t) => t.length > 0);
    if (trimmedChecklistTexts.length > HOMEWORK_CHECKLIST_MAX_ITEMS) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data: session, error: sessionError } = await supabase
      .from('com_t_session')
      .select('coach_id, student_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      logger.error('sessionHomework:create_homework_session_lookup_failed', sessionError?.message ?? 'session not found', { ...ctx, userId: user.id, payload: { sessionId } });
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
        homework_text: trimmedText,
      })
      .select('*')
      .single();

    if (error || !homeworkRow) {
      const errorCode = error?.code === '23505' ? 'already_exists' : 'unexpected_error';
      logger.error('sessionHomework:create_homework_failed', error?.message ?? 'No row inserted', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode };
    }

    let checklistItems: SessionHomeworkChecklistItem[] = [];
    if (trimmedChecklistTexts.length > 0) {
      const { data: insertedChecklistItems, error: checklistError } = await supabase
        .from('com_t_session_homework_checklist_item')
        .insert(
          trimmedChecklistTexts.map((itemText, index) => ({
            homework_id: homeworkRow.homework_id,
            item_no: index + 1,
            item_text: itemText,
          }))
        )
        .select('*');

      if (checklistError) {
        logger.error('sessionHomework:create_homework_checklist_failed', checklistError.message, {
          ...ctx,
          userId: user.id,
          payload: { sessionId, homeworkId: homeworkRow.homework_id },
        });
      } else {
        checklistItems = insertedChecklistItems ?? [];
      }
    }

    let attachmentRows: SessionHomeworkAttachment[] = [];
    if (attachments.length > 0) {
      const { data, error: attachmentError } = await supabase
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
        logger.error('sessionHomework:create_homework_attachments_failed', attachmentError.message, {
          ...ctx,
          userId: user.id,
          payload: { sessionId, homeworkId: homeworkRow.homework_id },
        });
      } else {
        attachmentRows = data;
      }
    }

    logger.info('sessionHomework:create_homework_success', 'Homework posted', { ...ctx, userId: user.id, payload: { sessionId, checklistCreated: checklistItems.length } });
    return {
      success: true,
      entry: { ...homeworkRow, attachments: attachmentRows, comments: [] } as SessionHomeworkEntry,
      checklistItems,
    };
  } catch (err) {
    logger.error('sessionHomework:create_homework_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 宿題本体へのフォローアップコメントを追加する（コーチのみ）。宿題本体が未投稿の場合は
 * errorCode: 'not_found'を返す。添付ファイルは事前にuploadSessionHomeworkAttachmentで
 * アップロード済みのPendingHomeworkAttachment配列を受け取る。
 */
export async function addHomeworkCommentCore(
  sessionId: string,
  commentText: string,
  attachments: PendingHomeworkAttachment[] = []
): Promise<AddHomeworkCommentResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const trimmed = commentText.trim();
    if (!trimmed && attachments.length === 0) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data: homework, error: homeworkError } = await supabase
      .from('com_t_session_homework')
      .select('homework_id, coach_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (homeworkError) {
      logger.error('sessionHomework:add_comment_homework_lookup_failed', homeworkError.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!homework) {
      return { success: false, errorCode: 'not_found' };
    }
    if (homework.coach_id !== user.id) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: commentRow, error } = await supabase
      .from('com_t_session_homework_comment')
      .insert({
        homework_id: homework.homework_id,
        coach_id: user.id,
        comment_text: trimmed,
      })
      .select('*')
      .single();

    if (error || !commentRow) {
      logger.error('sessionHomework:add_comment_failed', error?.message ?? 'No row inserted', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    let attachmentRows: SessionHomeworkAttachment[] = [];
    if (attachments.length > 0) {
      const { data, error: attachmentError } = await supabase
        .from('com_t_session_homework_attachment')
        .insert(
          attachments.map((a) => ({
            comment_id: commentRow.comment_id,
            file_path: a.file_path,
            file_name: a.file_name,
            file_type: a.file_type,
            file_size: a.file_size,
          }))
        )
        .select('*');

      if (attachmentError) {
        logger.error('sessionHomework:add_comment_attachments_failed', attachmentError.message, {
          ...ctx,
          userId: user.id,
          payload: { sessionId, commentId: commentRow.comment_id },
        });
      } else {
        attachmentRows = data;
      }
    }

    logger.info('sessionHomework:add_comment_success', 'Homework comment posted', { ...ctx, userId: user.id, payload: { sessionId } });
    return { success: true, comment: { ...commentRow, attachments: attachmentRows } as SessionHomeworkComment };
  } catch (err) {
    logger.error('sessionHomework:add_comment_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定session_idの宿題チェックリスト項目一覧を取得する（コーチ本人・対象生徒本人・
 * 管理者のみRLSにより閲覧可能）。宿題本体が未投稿の場合はitems: []を返す。
 */
export async function getHomeworkChecklistCore(sessionId: string): Promise<GetHomeworkChecklistResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: homework, error: homeworkError } = await supabase
      .from('com_t_session_homework')
      .select('homework_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (homeworkError) {
      logger.error('sessionHomework:get_checklist_homework_lookup_failed', homeworkError.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!homework) {
      return { success: true, items: [] };
    }

    const { data, error } = await supabase
      .from('com_t_session_homework_checklist_item')
      .select('*')
      .eq('homework_id', homework.homework_id)
      .order('item_no', { ascending: true });

    if (error) {
      logger.error('sessionHomework:get_checklist_failed', error.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, items: data ?? [] };
  } catch (err) {
    logger.error('sessionHomework:get_checklist_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 宿題チェックリスト項目の完了状態(is_done)を更新する（対象生徒本人のみ）。
 * RLSのUPDATE行ポリシー（対象宿題のstudent_id=auth.uid()）と列単位GRANT
 * （is_done/done_at/update_dateのみ更新可）により、項目本文の改ざんや他生徒の
 * 項目の更新は不可能。0件更新（対象なし、またはRLSで弾かれた）はforbiddenとして扱い、
 * 存在有無を区別する情報は返さない。
 */
export async function updateHomeworkChecklistItemStatusCore(
  checklistItemId: string,
  isDone: boolean
): Promise<UpdateHomeworkChecklistItemResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: item, error } = await supabase
      .from('com_t_session_homework_checklist_item')
      .update({ is_done: isDone, done_at: isDone ? new Date().toISOString() : null, update_date: new Date().toISOString() })
      .eq('checklist_item_id', checklistItemId)
      .select('*')
      .maybeSingle();

    if (error) {
      logger.error('sessionHomework:update_checklist_item_failed', error.message, { ...ctx, userId: user.id, payload: { checklistItemId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!item) {
      return { success: false, errorCode: 'forbidden' };
    }

    logger.info('sessionHomework:update_checklist_item_success', 'Checklist item updated', { ...ctx, userId: user.id, payload: { checklistItemId, isDone } });
    return { success: true, item };
  } catch (err) {
    logger.error('sessionHomework:update_checklist_item_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
