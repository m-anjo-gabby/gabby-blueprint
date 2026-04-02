'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { Content, ContentRecord, ContentTagSummary } from '@/types/content';

/**
 * 教材一覧取得（サーバーサイドページネーション）
 */
export async function getContents(page: number = 1, limit: number = 10, searchQuery?: string) {
  const supabase = await createAdminClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // selectの中身をリレーションを含めた形に修正
  let query = supabase
    .from('com_m_contents')
    .select(`
      *,
      tags:com_t_contents_tag_rel(
        tag:com_m_contents_tag(
          tag_id,
          tag_name,
          tag_type
        )
      ),
      access:com_m_contents_access(
        client:com_m_client(
          client_id,
          client_name
        )
      )
    `, { count: 'exact' })
    .eq('delete_flg', '0')
    .eq('access.delete_flg', '0')
    // メインの教材リストのソート
    .order('content_type', { ascending: true })
    .order('seq_no', { ascending: true })
    // リレーション先のタグのソート（テーブル名をドットで繋いで指定）
    .order('seq_no', { referencedTable: 'com_t_contents_tag_rel.com_m_contents_tag', ascending: true })
    .range(from, to);

  // 検索クエリ（教材名、ラベル）
  if (searchQuery) {
    query = query.or(`content_name.ilike.%${searchQuery}%,content_label.ilike.%${searchQuery}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching contents:', error);
    throw new Error(error.message);
  }

  // データ整形
  const contents: Content[] = (data || []).map((item: any) => ({
    ...item,
    // タグのフラット化
    tags: item.tags?.map((t: any) => t.tag).filter(Boolean) || [],
    // アクセス権（クライアント）のフラット化
    access_clients: item.access?.map((a: any) => a.client).filter(Boolean) || []
  }));

  return {
    contents,
    totalCount: count || 0,
  };
}

/**
 * IDを指定して教材情報を取得する
 */
export async function getContentById(contentId: string): Promise<ContentRecord | null> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from('com_m_contents')
      .select('*')
      .eq('content_id', contentId)
      .eq('delete_flg', '0') // 論理削除されていないもの
      .single();

    if (error) {
      console.error('Error fetching content:', error);
      return null;
    }

    return data as ContentRecord;
  } catch (err) {
    console.error('System error:', err);
    return null;
  }
}

/**
 * 教材の登録・更新 (Upsert)
 */
export async function upsertContent(payload: Partial<Content>) {
  const supabase = await createAdminClient();
  const isEdit = !!payload.content_id;

  const dataToSave = {
    ...payload,
    update_date: new Date().toISOString(),
  };

  let query;
  if (isEdit) {
    // 更新
    query = supabase
      .from('com_m_contents')
      .update(dataToSave)
      .eq('content_id', payload.content_id)
      .select();
  } else {
    // 新規作成
    query = supabase
      .from('com_m_contents')
      .insert([dataToSave])
      .select();
  }

  const { data, error } = await query;

  if (error) {
    console.error('Upsert content error:', error);
    return { success: false, message: error.message };
  }

  revalidatePath('/admin/contents');
  return { success: true, data: data?.[0] as Content };
}

/**
 * 教材の論理削除
 */
export async function deleteContent(contentId: string) {
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('com_m_contents')
    .update({ 
      delete_flg: '1',
      update_date: new Date().toISOString() 
    })
    .eq('content_id', contentId);

  if (error) {
    console.error('Delete content error:', error);
    return { success: false, message: error.message };
  }

  revalidatePath('/admin/contents');
  return { success: true };
}

/**
 * タグ割当用データの取得
 * 指定した教材に「割当済みのタグ」と「未割当のタグ」を分けて返す
 */
export async function getTagAssignmentData(contentId: string) {
  const supabase = await createAdminClient();

  // 1. すべての有効なタグマスタを取得
  const { data: allTags, error: tagError } = await supabase
    .from('com_m_contents_tag')
    .select('tag_id, tag_name, tag_type, seq_no')
    .eq('delete_flg', '0')
    .order('seq_no', { ascending: true });

  if (tagError) throw new Error(tagError.message);

  // 2. 現在その教材に紐づいているタグIDの一覧を取得
  const { data: relData, error: relError } = await supabase
    .from('com_t_contents_tag_rel')
    .select('tag_id')
    .eq('content_id', contentId);

  if (relError) throw new Error(relError.message);

  const assignedTagIds = new Set((relData as any[]).map(r => r.tag_id));

  // 3. 割当済みと未割当に振り分け
  const assignedTags: ContentTagSummary[] = [];
  const unassignedTags: ContentTagSummary[] = [];

  (allTags as any[]).forEach(tag => {
    if (assignedTagIds.has(tag.tag_id)) {
      assignedTags.push(tag);
    } else {
      unassignedTags.push(tag);
    }
  });

  return { assignedTags, unassignedTags };
}

/**
 * 教材にタグを割り当てる
 */
export async function assignTag(contentId: string, tagId: string) {
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('com_t_contents_tag_rel')
    .insert({
      content_id: contentId,
      tag_id: tagId
    });

  if (error) {
    console.error('Error assigning tag:', error);
    return { success: false, message: error.message };
  }

  // 一覧側のキャッシュ更新（Next.jsのタグ機能などを使っている場合）
  // revalidatePath('/admin/contents'); 
  
  return { success: true };
}

/**
 * 教材からタグの割当を解除する
 */
export async function removeTag(contentId: string, tagId: string) {
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('com_t_contents_tag_rel')
    .delete()
    .eq('content_id', contentId)
    .eq('tag_id', tagId);

  if (error) {
    console.error('Error removing tag:', error);
    return { success: false, message: error.message };
  }

  return { success: true };
}

/**
 * 教材のアクセス権限（クライアント割当）データ取得
 */
export async function getContentAccessData(contentId: string) {
  const supabase = await createAdminClient();

  // 1. 全クライアントマスタ取得
  const { data: allClients, error: clientError } = await supabase
    .from('com_m_client')
    .select('client_id, client_name')
    .eq('delete_flg', '0')
    .order('client_name', { ascending: true });

  if (clientError) throw new Error(clientError.message);

  // 2. 現在の割当状況取得
  const { data: accessData, error: accessError } = await supabase
    .from('com_m_contents_access')
    .select('client_id')
    .eq('content_id', contentId)
    .eq('delete_flg', '0');

  if (accessError) throw new Error(accessError.message);

  const assignedClientIds = new Set((accessData as any[]).map(a => a.client_id));

  // 3. 振り分け
  const assignedClients: any[] = [];
  const unassignedClients: any[] = [];

  (allClients as any[]).forEach(client => {
    if (assignedClientIds.has(client.client_id)) {
      assignedClients.push(client);
    } else {
      unassignedClients.push(client);
    }
  });

  return { assignedClients, unassignedClients };
}

/**
 * クライアントに教材アクセス権を付与
 */
export async function assignAccess(contentId: string, clientId: string) {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('com_m_contents_access')
    .insert({ content_id: contentId, client_id: clientId });

  if (error) return { success: false, message: error.message };

  revalidatePath('/admin/contents');
  return { success: true };
}

/**
 * クライアントの教材アクセス権を解除
 */
export async function removeAccess(contentId: string, clientId: string) {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('com_m_contents_access')
    .delete()
    .eq('content_id', contentId)
    .eq('client_id', clientId);

  if (error) return { success: false, message: error.message };

  revalidatePath('/admin/contents');
  return { success: true };
}