'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { revalidatePath } from "next/cache";
// インポートパスを index.ts 参照へ修正し、getLogContext を追加
import { createLogger, getLogContext } from '@gabby/lib/logger';

const logger = createLogger('admin');

/**
 * 規約情報の一覧取得
 */
export async function getTerms(page: number = 1, pageSize: number = 10, searchQuery?: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('com_m_terms')
      .select('*', { count: 'exact' });

    if (searchQuery) {
      query = query.ilike('version_name', `%${searchQuery}%`);
    }

    const { data, error, count } = await query
      .order('term_type', { ascending: true })
      .order('published_date', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error('term:get_terms_failed', error.message, { ...ctx, payload: { page, pageSize, searchQuery } });
      throw error;
    }

    const now = new Date();
    const currentActiveIds = new Map();
    const allDataForLogic = data || [];
    
    ["TERMS", "PRIVACY"].forEach(type => {
      const latestActive = allDataForLogic.find(t => 
        t.term_type === type && new Date(t.published_date) <= now
      );
      if (latestActive) {
        currentActiveIds.set(type, latestActive.term_id);
      }
    });

    const formattedTerms = allDataForLogic.map((term) => ({
      ...term,
      is_current: currentActiveIds.get(term.term_type) === term.term_id,
    }));

    return {
      terms: formattedTerms,
      totalCount: count || 0,
    };
  } catch (error) {
    logger.error('term:get_terms_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { page, pageSize, searchQuery } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 規約の削除
 */
export async function deleteTerm(termId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('com_m_terms').delete().eq('term_id', termId);
    
    if (error) {
      logger.error('term:delete_term_failed', error.message, { ...ctx, payload: { termId } });
      throw error;
    }

    logger.info('term:delete_term_success', `Term deleted`, { 
      ...ctx,
      payload: { termId } 
    });

    revalidatePath('/terms');
    return { success: true };
  } catch (error) {
    logger.error('term:delete_term_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { termId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 規約の個別取得
 */
export async function getTermById(termId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_terms')
      .select('*')
      .eq('term_id', termId)
      .single();

    if (error) {
      logger.error('term:get_term_by_id_failed', error.message, { ...ctx, payload: { termId } });
      throw error;
    }
    return data;
  } catch (error) {
    logger.error('term:get_term_by_id_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { termId } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * StorageからMarkdownの内容を取得
 */
export async function getTermContent(storagePath: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from('terms')
      .download(storagePath);

    if (error) {
      logger.error("term:get_term_content_failed", error.message, { ...ctx, payload: { storagePath } });
      return "";
    }
    return await data.text();
  } catch (error) {
    logger.error("term:get_term_content_unexpected", error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { storagePath } });
    return "";
  }
}

/**
 * Markdownの内容をStorageに上書き保存
 */
export async function updateTermContent(storagePath: string, content: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const cleanPath = storagePath.startsWith('/') ? storagePath.substring(1) : storagePath;

    const { error } = await supabase.storage
      .from('terms')
      .upload(cleanPath, content, {
        upsert: true,
        contentType: 'text/markdown',
        cacheControl: '3600'
      });

    if (error) {
      logger.error("term:update_term_content_failed", error.message, { ...ctx, payload: { storagePath: cleanPath } });
      throw error;
    }

    logger.info('term:update_term_content_success', `Term content updated in storage`, { 
      ...ctx,
      payload: { storagePath: cleanPath } 
    });
    
    revalidatePath('/terms');
    return { success: true };
  } catch (error) {
    logger.error("term:update_term_content_unexpected", error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { storagePath } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}