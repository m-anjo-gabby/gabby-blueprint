'use server';

import { unstable_rethrow } from 'next/navigation';

import { requireAdminRole, ADMIN_OR_CONTENT_MANAGER } from '@/lib/adminAuth';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { type ContentTag } from '@gabby/types/content';
import type { TableInsert } from '@gabby/types/db';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getTranslations } from 'next-intl/server';
import type { ActionResult } from '@gabby/types/action';

const logger = createLogger('admin');

/** * タグ一覧取得
 */
export async function getTags(): Promise<ContentTag[]> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_contents_tag')
      .select('*')
      .order('tag_type', { ascending: true })
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error('tag:get_tags_failed', error.message, { ...ctx, err: error });
      throw new Error(error.message);
    }
    return data as ContentTag[];
  } catch (error) {
    unstable_rethrow(error);
    logger.error('tag:get_tags_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
    });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/** * タグの保存（新規・更新）
 */
export async function upsertTag(
  payload: TableInsert<'com_m_contents_tag'>,
): Promise<ActionResult<{ data: ContentTag }>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const isEdit = !!payload.tag_id;

    const { data, error } = await supabase
      .from('com_m_contents_tag')
      .upsert({
        ...payload,
        update_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error('tag:upsert_tag_failed', error.message, { ...ctx, err: error, payload });
      return { success: false, message: t('common.errors.unexpected') };
    }

    const savedTag = data as ContentTag;
    logger.info('tag:upsert_tag_success', `Tag ${isEdit ? 'updated' : 'created'}: ${savedTag.tag_name}`, {
      ...ctx,
      payload: { tagId: savedTag.tag_id, isEdit },
    });

    revalidatePath('/contents/tags');
    return { success: true, data: savedTag };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('tag:upsert_tag_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * タグの削除（教材との紐付けも一緒に消える）
 */
export async function deleteTag(tagId: string): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('com_m_contents_tag').delete().eq('tag_id', tagId);

    if (error) {
      logger.error('tag:delete_tag_failed', error.message, { ...ctx, err: error, payload: { tagId } });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('tag:delete_tag_success', `Tag deleted`, {
      ...ctx,
      payload: { tagId },
    });

    revalidatePath('/contents/tags');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('tag:delete_tag_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { tagId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}
