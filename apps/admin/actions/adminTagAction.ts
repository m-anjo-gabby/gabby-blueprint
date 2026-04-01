'use server';

import { createAdminClient } from '@/lib/admin';
import { ContentTag } from '@/types/content';
import { revalidatePath } from 'next/cache';

/** タグ一覧取得 */
export async function getTags() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('com_m_contents_tag')
    .select('*')
    .eq('delete_flg', '0')
    .order('tag_type', { ascending: true })
    .order('seq_no', { ascending: true });

  if (error) throw new Error(error.message);
  return data as ContentTag[];
}

/** タグの保存（新規・更新） */
export async function upsertTag(payload: Partial<ContentTag>) {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from('com_m_contents_tag')
    .upsert({
      ...payload,
      update_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: error.message };
  }
  
  revalidatePath('/admin/contents/tags');
  return { success: true, data };
}

/** タグの論理削除 */
export async function deleteTag(tagId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('com_m_contents_tag')
    .update({ delete_flg: '1', update_date: new Date().toISOString() })
    .eq('tag_id', tagId);

  if (error) {
    return { success: false, message: error.message };
  }

  revalidatePath('/admin/contents/tags');
  return { success: true };
}