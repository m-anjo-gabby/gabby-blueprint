'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { DialogueSession } from '@gabby/types/dialogue';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';

const logger = createLogger('admin');

/**
 * 指定教材（ダイアログプラクティスのセット）配下のセッション明細一覧を取得する
 */
export async function getDialogueSessions(contentId: string): Promise<DialogueSession[]> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('com_m_dialogue_session')
      .select('*')
      .eq('content_id', contentId)
      .eq('delete_flg', '0')
      .order('session_no', { ascending: true });

    if (error) {
      logger.error('dialogue:get_sessions_failed', error.message, { ...ctx, payload: { contentId } });
      return [];
    }

    return (data || []) as DialogueSession[];
  } catch (error) {
    logger.error('dialogue:get_sessions_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contentId } });
    return [];
  }
}

interface UpsertDialogueSessionPayload {
  dialogue_session_id?: string;
  content_id: string;
  session_no: number;
  coach_slides_title: string | null;
  coach_slides_link: string | null;
  student_slides_title: string | null;
  student_slides_link: string | null;
  admin_notes: string | null;
}

/**
 * ダイアログプラクティス セッション明細の登録・更新 (Upsert)
 */
export async function upsertDialogueSession(payload: UpsertDialogueSessionPayload) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const isEdit = !!payload.dialogue_session_id;

    const dataToSave = {
      content_id: payload.content_id,
      session_no: payload.session_no,
      coach_slides_title: payload.coach_slides_title,
      coach_slides_link: payload.coach_slides_link,
      student_slides_title: payload.student_slides_title,
      student_slides_link: payload.student_slides_link,
      admin_notes: payload.admin_notes,
      update_date: new Date().toISOString(),
    };

    let query;
    if (isEdit) {
      query = supabase
        .from('com_m_dialogue_session')
        .update(dataToSave)
        .eq('dialogue_session_id', payload.dialogue_session_id)
        .select()
        .single();
    } else {
      query = supabase
        .from('com_m_dialogue_session')
        .insert([dataToSave])
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      logger.error('dialogue:upsert_session_failed', error.message, { ...ctx, payload });
      // UNIQUE(content_id, session_no) 制約違反を分かりやすいメッセージに変換
      if (error.code === '23505') {
        return { success: false, message: 'このセッション番号は既に使用されています' };
      }
      return { success: false, message: error.message };
    }

    logger.info('dialogue:upsert_session_success', `Dialogue session ${isEdit ? 'updated' : 'created'}`, {
      ...ctx,
      payload: { dialogueSessionId: data.dialogue_session_id, contentId: payload.content_id, isEdit },
    });

    revalidatePath(`/contents/${payload.content_id}`);
    return { success: true, data: data as DialogueSession };
  } catch (error) {
    logger.error('dialogue:upsert_session_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * ダイアログプラクティス セッション明細の論理削除
 */
export async function deleteDialogueSession(dialogueSessionId: string, contentId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('com_m_dialogue_session')
      .update({
        delete_flg: '1',
        update_date: new Date().toISOString(),
      })
      .eq('dialogue_session_id', dialogueSessionId);

    if (error) {
      logger.error('dialogue:delete_session_failed', error.message, { ...ctx, payload: { dialogueSessionId } });
      return { success: false, message: error.message };
    }

    logger.info('dialogue:delete_session_success', 'Dialogue session logically deleted', { ...ctx, payload: { dialogueSessionId } });

    revalidatePath(`/contents/${contentId}`);
    return { success: true };
  } catch (error) {
    logger.error('dialogue:delete_session_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { dialogueSessionId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}
