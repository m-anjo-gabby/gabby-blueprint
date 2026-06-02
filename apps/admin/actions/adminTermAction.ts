'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { formatToJstDate, getUtcRangeFromJstDate } from "@gabby/lib/date/date";
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
      published_date: term.published_date ? formatToJstDate(term.published_date) : '',
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

    // 1. 削除前にStorageパスを取得しておく
    const { data: term } = await supabase
      .from('com_m_terms')
      .select('storage_path')
      .eq('term_id', termId)
      .single();

    // 2. DBレコードを削除
    const { error } = await supabase.from('com_m_terms').delete().eq('term_id', termId);
    
    if (error) {
      logger.error('term:delete_term_failed', error.message, { ...ctx, payload: { termId } });
      throw error;
    }

    // 3. Storageからファイルを削除（レコード削除成功後）
    if (term?.storage_path) {
      const cleanPath = term.storage_path.startsWith('/') ? term.storage_path.substring(1) : term.storage_path;
      await supabase.storage.from('terms').remove([cleanPath]);
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
 * 規約の更新（内容の上書き・バージョン名変更）
 * キャッシュ対策のため、保存のたびにタイムスタンプを含んだ新しいパスを作成して保存します。
 */
export async function updateTerm(
  termId: string, 
  termType: string,
  versionName: string,
  content: string,
  oldStoragePath: string
) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    // 1. キャッシュ対策のためタイムスタンプを含んだ新しいパスを生成
    // 例: tos/tos_v1.1.0_20260508121011.md
    const folder = termType.toUpperCase() === 'TERMS' ? 'tos' : 'privacy';
    const timestamp = new Date().toISOString()
      .replace(/[-:T]/g, '')  // 記号を削除
      .split('.')[0];        // ミリ秒以降を削除 (YYYYMMDDHHMMSS)
    const newPath = `${folder}/${folder}_${versionName}_${timestamp}.md`;

    // 2. Storageにアップロード (upsert: false で常に新規ファイルとして扱う)
    const { error: uploadError } = await supabase.storage
      .from('terms')
      .upload(newPath, content, {
        contentType: 'text/markdown',
        cacheControl: '3600',
        upsert: false 
      });

    if (uploadError) {
      logger.error("term:update_storage_failed", uploadError.message, { ...ctx, payload: { path: newPath } });
      throw uploadError;
    }

    // 3. DBレコードを更新 (storage_pathを新しいファイルに差し替え)
    const { error: dbError } = await supabase
      .from('com_m_terms')
      .update({
        version_name: versionName,
        storage_path: newPath,
        update_date: new Date().toISOString()
      })
      .eq('term_id', termId);

    if (dbError) {
      // DB更新失敗時はアップロードしたファイルを削除してロールバック
      await supabase.storage.from('terms').remove([newPath]);
      logger.error("term:update_db_failed", dbError.message, { ...ctx, payload: { termId } });
      throw dbError;
    }

    // 4. 古いファイルを削除（ストレージの肥大化を防ぐため）
    const cleanOldPath = oldStoragePath?.startsWith('/') ? oldStoragePath.substring(1) : oldStoragePath;
    if (cleanOldPath && cleanOldPath !== newPath) {
      await supabase.storage.from('terms').remove([cleanOldPath]);
    }

    logger.info('term:update_term_success', `Term updated with cache busting path`, { 
      ...ctx,
      payload: { termId, newPath, oldPath: oldStoragePath } 
    });
    
    revalidatePath('/terms');
    return { success: true, newPath };
  } catch (error) {
    logger.error("term:update_term_unexpected", error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { termId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 規約の新規作成
 */
export async function createTerm(params: {
  term_type: string;
  version_name: string;
  published_date: string; // "YYYY-MM-DD" 形式（JST）
  is_required: boolean;
  content: string;
}) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    // 1. 公開日のUTC変換 (日付のみ入力からJST 00:00:00のUTC値を生成)
    const { startUtc: publishedUtc } = getUtcRangeFromJstDate(params.published_date, params.published_date);

    // 2. Storageパス生成 (種別/種別_バージョン_タイムスタンプ.md)
    const folder = params.term_type.toUpperCase() === 'TERMS' ? 'tos' : 'privacy';
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const newPath = `${folder}/${folder}_${params.version_name}_${timestamp}.md`;

    // 3. Storageにアップロード
    const { error: uploadError } = await supabase.storage
      .from('terms')
      .upload(newPath, params.content, {
        contentType: 'text/markdown',
        upsert: false 
      });

    if (uploadError) {
      logger.error("term:create_storage_failed", uploadError.message, { ...ctx, payload: { path: newPath } });
      throw uploadError;
    }

    // 4. DBレコードを挿入
    const { data, error: dbError } = await supabase
      .from('com_m_terms')
      .insert({
        term_type: params.term_type,
        version_name: params.version_name,
        storage_path: newPath,
        is_required: params.is_required,
        published_date: publishedUtc,
      })
      .select()
      .single();

    if (dbError) {
      await supabase.storage.from('terms').remove([newPath]);
      if (dbError.code === '23505') {
        return { success: false, message: 'この種別とバージョンの組み合わせは既に存在します' };
      }
      logger.error("term:create_db_failed", dbError.message, { ...ctx, payload: params });
      throw dbError;
    }

    logger.info('term:create_term_success', `Term created`, { ...ctx, payload: { termId: data.term_id } });
    revalidatePath('/terms');
    return { success: true };
  } catch (error) {
    logger.error("term:create_term_unexpected", error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: params });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}