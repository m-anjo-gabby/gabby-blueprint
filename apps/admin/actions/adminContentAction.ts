'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { Content, ContentRecord, ContentTagSummary } from '@gabby/types/content';
// パスを index.ts 参照へ修正し、getLogContext を追加
import { createLogger, getLogContext } from '@gabby/lib/logger';

const logger = createLogger('admin');

/**
 * 教材一覧取得（サーバーサイドページネーション）
 */
export async function getContents(page: number = 1, limit: number = 10, searchQuery?: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

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
      .order('content_type', { ascending: true })
      .order('seq_no', { ascending: true })
      .order('seq_no', { referencedTable: 'com_t_contents_tag_rel.com_m_contents_tag', ascending: true })
      .range(from, to);

    if (searchQuery) {
      query = query.or(`content_name.ilike.%${searchQuery}%,content_label.ilike.%${searchQuery}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error('content:get_contents_failed', error.message, { ...ctx, payload: { page, limit, searchQuery } });
      throw new Error(error.message);
    }

    const contents: Content[] = (data || []).map((item: any) => ({
      ...item,
      tags: item.tags?.map((t: any) => t.tag).filter(Boolean) || [],
      access_clients: item.access?.map((a: any) => a.client).filter(Boolean) || []
    }));

    return {
      contents,
      totalCount: count || 0,
    };
  } catch (error) {
    logger.error('content:get_contents_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { page, limit, searchQuery } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * IDを指定して教材情報を取得する
 */
export async function getContentById(contentId: string): Promise<ContentRecord | null> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('com_m_contents')
      .select('*')
      .eq('content_id', contentId)
      .eq('delete_flg', '0')
      .single();

    if (error) {
      logger.error('content:get_content_by_id_failed', error.message, { ...ctx, payload: { contentId } });
      return null;
    }

    return data as ContentRecord;
  } catch (err) {
    logger.error('content:get_content_by_id_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { contentId } });
    return null;
  }
}

/**
 * 教材の登録・更新 (Upsert)
 */
export async function upsertContent(payload: Partial<Content>) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const isEdit = !!payload.content_id;

    // 更新（Edit）時の既存メタデータとの安全なマージ処理
    let finalMetadata = payload.metadata || {};
    if (isEdit && payload.content_id) {
      const { data: existingRecord } = await supabase
        .from('com_m_contents')
        .select('metadata')
        .eq('content_id', payload.content_id)
        .single();
      
      if (existingRecord?.metadata) {
        finalMetadata = {
          ...(existingRecord.metadata as Record<string, unknown>),
          ...payload.metadata,
          // スプリントデータの階層が壊れないよう明示的にディープマージ
          sprint: payload.metadata?.sprint ? {
            ...((existingRecord.metadata as any).sprint || {}),
            ...payload.metadata.sprint
          } : (existingRecord.metadata as any).sprint
        };
      }
    }

    // クライアント側で既存の metadata とマージされたものが送られてくる想定
    const dataToSave = {
      ...payload,
      metadata: finalMetadata,
      update_date: new Date().toISOString(),
    };

    // リレーション項目（tagsやaccess_clients）がpayloadに含まれている場合は、
    // com_m_contentsの直接のカラムではないため、DB保存前に除外する
    delete (dataToSave as any).tags;
    delete (dataToSave as any).access_clients;

    let query;
    if (isEdit) {
      query = supabase
        .from('com_m_contents')
        .update(dataToSave)
        .eq('content_id', payload.content_id)
        .select();
    } else {
      query = supabase
        .from('com_m_contents')
        .insert([dataToSave])
        .select();
    }

    const { data, error } = await query;

    if (error) {
      logger.error('content:upsert_content_failed', error.message, { ...ctx, payload });
      return { success: false, message: error.message };
    }

    const savedContent = data?.[0] as Content;
    logger.info('content:upsert_content_success', `Content ${isEdit ? 'updated' : 'created'}: ${savedContent.content_name}`, { 
      ...ctx, 
      payload: { contentId: savedContent.content_id, isEdit } 
    });

    revalidatePath('/contents');
    return { success: true, data: savedContent };
  } catch (error) {
    logger.error('content:upsert_content_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 教材の論理削除
 */
export async function deleteContent(contentId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('com_m_contents')
      .update({ 
        delete_flg: '1',
        update_date: new Date().toISOString() 
      })
      .eq('content_id', contentId);

    if (error) {
      logger.error('content:delete_content_failed', error.message, { ...ctx, payload: { contentId } });
      return { success: false, message: error.message };
    }

    logger.info('content:delete_content_success', `Content logically deleted`, { 
      ...ctx,
      payload: { contentId } 
    });

    revalidatePath('/contents');
    return { success: true };
  } catch (error) {
    logger.error('content:delete_content_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contentId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * タグ割当用データの取得
 */
export async function getTagAssignmentData(contentId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data: allTags, error: tagError } = await supabase
      .from('com_m_contents_tag')
      .select('tag_id, tag_name, tag_type, seq_no')
      .eq('delete_flg', '0')
      .order('seq_no', { ascending: true });

    if (tagError) {
      logger.error('content:get_tag_assignment_all_tags_failed', tagError.message, { ...ctx, payload: { contentId } });
      throw new Error(tagError.message);
    }

    const { data: relData, error: relError } = await supabase
      .from('com_t_contents_tag_rel')
      .select('tag_id')
      .eq('content_id', contentId);

    if (relError) {
      logger.error('content:get_tag_assignment_rel_data_failed', relError.message, { ...ctx, payload: { contentId } });
      throw new Error(relError.message);
    }

    const assignedTagIds = new Set((relData as any[]).map(r => r.tag_id));
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
  } catch (error) {
    logger.error('content:get_tag_assignment_data_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contentId } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 教材にタグを割り当てる
 */
export async function assignTag(contentId: string, tagId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('com_t_contents_tag_rel')
      .insert({
        content_id: contentId,
        tag_id: tagId
      });

    if (error) {
      logger.error('content:assign_tag_failed', error.message, { ...ctx, payload: { contentId, tagId } });
      return { success: false, message: error.message };
    }

    logger.info('content:assign_tag_success', `Tag assigned to content`, { 
      ...ctx,
      payload: { contentId, tagId } 
    });

    return { success: true };
  } catch (error) {
    logger.error('content:assign_tag_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contentId, tagId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 教材からタグの割当を解除する
 */
export async function removeTag(contentId: string, tagId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('com_t_contents_tag_rel')
      .delete()
      .eq('content_id', contentId)
      .eq('tag_id', tagId);

    if (error) {
      logger.error('content:remove_tag_failed', error.message, { ...ctx, payload: { contentId, tagId } });
      return { success: false, message: error.message };
    }

    logger.info('content:remove_tag_success', `Tag removed from content`, { 
      ...ctx,
      payload: { contentId, tagId } 
    });

    return { success: true };
  } catch (error) {
    logger.error('content:remove_tag_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contentId, tagId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 教材のアクセス権限（クライアント割当）データ取得
 */
export async function getContentAccessData(contentId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data: allClients, error: clientError } = await supabase
      .from('com_m_client')
      .select('client_id, client_name')
      .eq('delete_flg', '0')
      .order('client_name', { ascending: true });

    if (clientError) {
      logger.error('content:get_content_access_all_clients_failed', clientError.message, { ...ctx, payload: { contentId } });
      throw new Error(clientError.message);
    }

    const { data: accessData, error: accessError } = await supabase
      .from('com_m_contents_access')
      .select('client_id')
      .eq('content_id', contentId)
      .eq('delete_flg', '0');

    if (accessError) {
      logger.error('content:get_content_access_data_failed', accessError.message, { ...ctx, payload: { contentId } });
      throw new Error(accessError.message);
    }

    const assignedClientIds = new Set((accessData as any[]).map(a => a.client_id));
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
  } catch (error) {
    logger.error('content:get_content_access_data_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contentId } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * クライアントに教材アクセス権を付与
 */
export async function assignAccess(contentId: string, clientId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('com_m_contents_access')
      .insert({ content_id: contentId, client_id: clientId });

    if (error) {
      logger.error('content:assign_access_failed', error.message, { ...ctx, payload: { contentId, clientId } });
      return { success: false, message: error.message };
    }

    logger.info('content:assign_access_success', `Access assigned to client`, { 
      ...ctx,
      payload: { contentId, clientId } 
    });

    revalidatePath('/contents');
    return { success: true };
  } catch (error) {
    logger.error('content:assign_access_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contentId, clientId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * クライアントの教材アクセス権を解除
 */
export async function removeAccess(contentId: string, clientId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('com_m_contents_access')
      .delete()
      .eq('content_id', contentId)
      .eq('client_id', clientId);

    if (error) {
      logger.error('content:remove_access_failed', error.message, { ...ctx, payload: { contentId, clientId } });
      return { success: false, message: error.message };
    }

    logger.info('content:remove_access_success', `Access removed from client`, { 
      ...ctx,
      payload: { contentId, clientId } 
    });

    revalidatePath('/contents');
    return { success: true };
  } catch (error) {
    logger.error('content:remove_access_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contentId, clientId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}