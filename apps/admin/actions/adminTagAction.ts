'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { ContentTag } from '@gabby/types/content';
import { revalidatePath } from 'next/cache';
import { createLogger, getLogContext } from '@gabby/lib/logger';

const logger = createLogger('admin');

/** * タグ一覧取得 
 */
export async function getTags() {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_contents_tag')
      .select('*')
      .eq('delete_flg', '0')
      .order('tag_type', { ascending: true })
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error('tag:get_tags_failed', error.message, ctx);
      throw new Error(error.message);
    }
    return data as ContentTag[];
  } catch (error) {
    logger.error('tag:get_tags_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/** * タグの保存（新規・更新） 
 */
export async function upsertTag(payload: Partial<ContentTag>) {
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
      logger.error('tag:upsert_tag_failed', error.message, { ...ctx, payload });
      return { success: false, message: error.message };
    }

    const savedTag = data as ContentTag;
    logger.info('tag:upsert_tag_success', `Tag ${isEdit ? 'updated' : 'created'}: ${savedTag.tag_name}`, { 
      ...ctx,
      payload: { tagId: savedTag.tag_id, isEdit } 
    });
    
    revalidatePath('/contents/tags');
    return { success: true, data: savedTag };
  } catch (error) {
    logger.error('tag:upsert_tag_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/** * タグの論理削除 
 */
export async function deleteTag(tagId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('com_m_contents_tag')
      .update({ delete_flg: '1', update_date: new Date().toISOString() })
      .eq('tag_id', tagId);

    if (error) {
      logger.error('tag:delete_tag_failed', error.message, { ...ctx, payload: { tagId } });
      return { success: false, message: error.message };
    }

    logger.info('tag:delete_tag_success', `Tag logically deleted`, { 
      ...ctx,
      payload: { tagId } 
    });

    revalidatePath('/contents/tags');
    return { success: true };
  } catch (error) {
    logger.error('tag:delete_tag_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { tagId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}