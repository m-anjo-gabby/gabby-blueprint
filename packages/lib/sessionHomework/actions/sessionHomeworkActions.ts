'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  AddHomeworkChecklistItemsResult,
  AddSessionHomeworkResult,
  GetHomeworkChecklistResult,
  GetSessionHomeworkResult,
  HOMEWORK_CHECKLIST_MAX_ITEMS,
  PendingHomeworkAttachment,
  SessionHomeworkEntry,
  UpdateHomeworkChecklistItemResult,
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

    let attachmentRows: SessionHomeworkEntry['attachments'] = [];
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
        logger.error('sessionHomework:add_homework_attachments_failed', attachmentError.message, {
          ...ctx,
          userId: user.id,
          payload: { sessionId, homeworkId: homeworkRow.homework_id },
        });
      } else {
        attachmentRows = data;
      }
    }

    logger.info('sessionHomework:add_homework_success', 'Homework posted', { ...ctx, userId: user.id, payload: { sessionId } });
    return { success: true, entry: { ...homeworkRow, attachments: attachmentRows } as SessionHomeworkEntry };
  } catch (err) {
    logger.error('sessionHomework:add_homework_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定session_idの宿題チェックリスト項目一覧を取得する（コーチ本人・対象生徒本人・
 * 管理者のみRLSにより閲覧可能）。宿題メッセージ(com_t_session_homework)とは独立した
 * セッション単位のデータのため、getSessionHomeworkCoreとは別に取得する。
 */
export async function getHomeworkChecklistCore(sessionId: string): Promise<GetHomeworkChecklistResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_homework_checklist_item')
      .select('*')
      .eq('session_id', sessionId)
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
 * 宿題チェックリストに項目を追加する（コーチのみ、対象セッションの担当コーチであることを検証）。
 * 既存項目のitem_text変更・削除は不可（生徒が完了操作済みの項目の意味が後から変わらない
 * ようにするため）で、常に既存の最大item_noの続きから採番する「追加」のみ許可する。
 * セッションあたりHOMEWORK_CHECKLIST_MAX_ITEMS件が上限。
 */
export async function addHomeworkChecklistItemsCore(
  sessionId: string,
  itemTexts: string[]
): Promise<AddHomeworkChecklistItemsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const trimmedItemTexts = itemTexts.map((t) => t.trim()).filter((t) => t.length > 0);
    if (trimmedItemTexts.length === 0) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data: session, error: sessionError } = await supabase
      .from('com_t_session')
      .select('coach_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      logger.error('sessionHomework:add_checklist_session_lookup_failed', sessionError?.message ?? 'session not found', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (session.coach_id !== user.id) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: existingItems, error: existingError } = await supabase
      .from('com_t_session_homework_checklist_item')
      .select('item_no')
      .eq('session_id', sessionId)
      .order('item_no', { ascending: false })
      .limit(1);

    if (existingError) {
      logger.error('sessionHomework:add_checklist_existing_lookup_failed', existingError.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const currentCount = (existingItems?.[0]?.item_no ?? 0);
    if (currentCount + trimmedItemTexts.length > HOMEWORK_CHECKLIST_MAX_ITEMS) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data: insertedItems, error } = await supabase
      .from('com_t_session_homework_checklist_item')
      .insert(
        trimmedItemTexts.map((itemText, index) => ({
          session_id: sessionId,
          item_no: currentCount + index + 1,
          item_text: itemText,
        }))
      )
      .select('*');

    if (error || !insertedItems) {
      logger.error('sessionHomework:add_checklist_failed', error?.message ?? 'No rows inserted', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    logger.info('sessionHomework:add_checklist_success', 'Checklist items added', { ...ctx, userId: user.id, payload: { sessionId, count: insertedItems.length } });
    return { success: true, items: insertedItems };
  } catch (err) {
    logger.error('sessionHomework:add_checklist_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 宿題チェックリスト項目の完了状態(is_done)を更新する（対象生徒本人のみ）。
 * RLSのUPDATE行ポリシー（対象セッションのstudent_id=auth.uid()）と列単位GRANT
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
