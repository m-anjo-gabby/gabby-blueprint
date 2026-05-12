// apps/admin/actions/adminTermAction.ts
'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { createLogger } from '@gabby/lib/logger/logger';

const logger = createLogger('admin');

/**
 * 規約情報の一覧取得
 */
export async function getTerms(page: number = 1, pageSize: number = 10, searchQuery?: string) {
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

    // published_dateの降順で取得
    const { data, error, count } = await query
      .order('term_type', { ascending: true })
      .order('published_date', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error('term:get_terms_failed', error.message, { payload: { page, pageSize, searchQuery } });
      throw error;
    }

    const now = new Date();

    // --- 公開中（Current）を判定するロジック ---
    // 種別ごとに「現在時刻以下で最も新しいもの」のIDを保持する
    const currentActiveIds = new Map();
    
    // ソート済みデータから、各タイプごとに「公開中」となるべきIDを1つだけ特定する
    // (データは日付降順なので、最初に見つかった「現在時刻以下のレコード」がその時点の最新版)
    const allDataForLogic = data || [];
    
    // 重複を避けるため、全データから判定（ページネーションを跨ぐ場合は本来全件取得が必要ですが、
    // 直近の数件であればこのデータ内での判定で十分です）
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
      // DataTable側での判定用にフラグを整理
      is_current: currentActiveIds.get(term.term_type) === term.term_id,
    }));

    return {
      terms: formattedTerms,
      totalCount: count || 0,
    };
  } catch (error) {
    logger.error('term:get_terms_unexpected', error instanceof Error ? error.message : 'Unknown error', { payload: { page, pageSize, searchQuery } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 規約の削除（物理削除または論理削除は運用に合わせて調整）
 */
export async function deleteTerm(termId: string) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('com_m_terms').delete().eq('term_id', termId);
    if (error) {
      logger.error('term:delete_term_failed', error.message, { termId });
      throw error;
    }

    logger.info('term:delete_term_success', `Term deleted`, { 
      payload: { termId } 
    });

    revalidatePath('/terms');
    return { success: true };
  } catch (error) {
    logger.error('term:delete_term_unexpected', error instanceof Error ? error.message : 'Unknown error', { termId });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 規約の個別取得（編集画面用）
 */
export async function getTermById(termId: string) {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_terms')
      .select('*')
      .eq('term_id', termId)
      .single();

    if (error) {
      logger.error('term:get_term_by_id_failed', error.message, { termId });
      throw error;
    }
    return data;
  } catch (error) {
    logger.error('term:get_term_by_id_unexpected', error instanceof Error ? error.message : 'Unknown error', { termId });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * StorageからMarkdownの内容を取得
 */
export async function getTermContent(storagePath: string) {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from('terms')
      .download(storagePath);

    if (error) {
      logger.error("term:get_term_content_failed", error.message, { storagePath });
      return "";
    }
    return await data.text();
  } catch (error) {
    logger.error("term:get_term_content_unexpected", error instanceof Error ? error.message : 'Unknown error', { storagePath });
    return "";
  }
}

/**
 * Markdownの内容をStorageに上書き保存
 */
export async function updateTermContent(storagePath: string, content: string) {
  try {
    const supabase = createAdminClient();
    
    // pathの先頭にスラッシュがあるとエラーになる場合があるため除去
    const cleanPath = storagePath.startsWith('/') ? storagePath.substring(1) : storagePath;

    const { error } = await supabase.storage
      .from('terms')
      .upload(cleanPath, content, {
        upsert: true,
        contentType: 'text/markdown',
        cacheControl: '3600'
      });

    if (error) {
      logger.error("term:update_term_content_failed", error.message, { storagePath });
      throw error;
    }

    logger.info('term:update_term_content_success', `Term content updated in storage`, { 
      payload: { storagePath: cleanPath } 
    });
    
    revalidatePath('/terms');
    return { success: true };
  } catch (error) {
    logger.error("term:update_term_content_unexpected", error instanceof Error ? error.message : 'Unknown error', { storagePath });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}