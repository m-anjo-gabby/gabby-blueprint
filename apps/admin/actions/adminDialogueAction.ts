'use server';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { isInUseError } from '@gabby/lib/supabase/pgErrors';
import type { ActionResult, BasicErrorCode, CoreResult } from '@gabby/types/action';
import { type DialogueSession } from '@gabby/types/dialogue';
import { ADMIN_OR_CONTENT_MANAGER, requireAdminRole } from '@/lib/adminAuth';

const logger = createLogger('admin');

/**
 * 指定教材（ダイアログプラクティスのセット）配下のセッション明細一覧を取得する
 */
export async function getDialogueSessions(
  contentId: string,
): Promise<CoreResult<{ data: DialogueSession[] }, BasicErrorCode>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('com_m_dialogue_session')
      .select('*')
      .eq('content_id', contentId)
      .order('session_no', { ascending: true });

    if (error) {
      logger.error('dialogue:get_sessions_failed', error.message, { ...ctx, err: error, payload: { contentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, data: (data || []) as DialogueSession[] };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('dialogue:get_sessions_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentId },
    });
    return { success: false, errorCode: 'unexpected_error' };
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
export async function upsertDialogueSession(
  payload: UpsertDialogueSessionPayload,
): Promise<ActionResult<{ data: DialogueSession }>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
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
    if (payload.dialogue_session_id) {
      query = supabase
        .from('com_m_dialogue_session')
        .update(dataToSave)
        .eq('dialogue_session_id', payload.dialogue_session_id)
        .select()
        .single();
    } else {
      query = supabase.from('com_m_dialogue_session').insert([dataToSave]).select().single();
    }

    const { data, error } = await query;

    if (error) {
      logger.error('dialogue:upsert_session_failed', error.message, { ...ctx, err: error, payload });
      // UNIQUE(content_id, session_no) 制約違反を分かりやすいメッセージに変換
      if (error.code === '23505') {
        return { success: false, message: t('contents.errors.sessionNoInUse') };
      }
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('dialogue:upsert_session_success', `Dialogue session ${isEdit ? 'updated' : 'created'}`, {
      ...ctx,
      payload: { dialogueSessionId: data.dialogue_session_id, contentId: payload.content_id, isEdit },
    });

    revalidatePath(`/contents/${payload.content_id}`);
    return { success: true, data: data as DialogueSession };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('dialogue:upsert_session_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ダイアログプラクティス セッション明細の削除（誤登録の取り消し）。
 * 進捗・会話ログがあるセッションは外部キー（RESTRICT）で止まる
 */
export async function deleteDialogueSession(
  dialogueSessionId: string,
  contentId: string,
): Promise<ActionResult<object, 'in_use'>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('com_m_dialogue_session')
      .delete()
      .eq('dialogue_session_id', dialogueSessionId);

    if (error) {
      if (isInUseError(error))
        return { success: false, errorCode: 'in_use' as const, message: t('common.errors.unexpected') };
      logger.error('dialogue:delete_session_failed', error.message, {
        ...ctx,
        err: error,
        payload: { dialogueSessionId },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('dialogue:delete_session_success', 'Dialogue session deleted', {
      ...ctx,
      payload: { dialogueSessionId },
    });

    revalidatePath(`/contents/${contentId}`);
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('dialogue:delete_session_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { dialogueSessionId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}
