'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { upsertKnowledgeEntry, deleteKnowledgeEntry, type KnowledgeSourceType } from '@gabby/lib/ai';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';

const logger = createLogger('admin');
const TOOL_PATH = '/tools/ai-knowledge-base';

// ============================================================
// 型定義
// ============================================================

export interface KnowledgeEntry {
  knowledge_id: string;
  source_type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  embedding_model: string | null;
  update_date: string;
}

// ============================================================
// 取得系
// ============================================================

export interface GetKnowledgeEntriesResult {
  entries: KnowledgeEntry[];
  totalCount: number;
}

/**
 * ナレッジ一覧の取得（サーバーサイドページネーション）。
 * 本文全文を含むがembeddingベクトル自体は返さない。
 */
export async function getKnowledgeEntries(
  page: number = 1,
  limit: number = 10,
  sourceType?: string,
  searchQuery?: string
): Promise<GetKnowledgeEntriesResult> {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('com_m_ai_knowledge_base')
      .select('knowledge_id, source_type, title, body, metadata, embedding_model, update_date', { count: 'exact' })
      .eq('delete_flg', '0')
      .order('update_date', { ascending: false })
      .range(from, to);

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,body.ilike.%${searchQuery}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error('ai_kb:list_failed', error.message, { ...ctx, payload: { page, limit, sourceType, searchQuery } });
      return { entries: [], totalCount: 0 };
    }

    return { entries: data as KnowledgeEntry[], totalCount: count || 0 };
  } catch (err) {
    logger.error('ai_kb:list_unexpected', err instanceof Error ? err.message : 'Unknown', { ...ctx, payload: { page, limit, sourceType, searchQuery } });
    return { entries: [], totalCount: 0 };
  }
}

// ============================================================
// 更新系
// ============================================================

/**
 * ナレッジの新規登録/更新。
 * 本文からEmbeddingを再生成してcom_m_ai_knowledge_baseへ保存する（packages/lib/ai）。
 */
export async function saveKnowledgeEntryAction(payload: {
  knowledgeId?: string;
  sourceType: KnowledgeSourceType;
  title: string;
  body: string;
}) {
  const ctx = await getLogContext();
  try {
    const entry = await upsertKnowledgeEntry({
      knowledgeId: payload.knowledgeId,
      sourceType: payload.sourceType,
      title: payload.title,
      body: payload.body,
      createdBy: ctx.userId && ctx.userId !== 'system' ? ctx.userId : undefined,
    });

    logger.info('ai_kb:save_success', `Knowledge entry saved: ${entry.title}`, {
      ...ctx,
      payload: { knowledgeId: entry.knowledgeId, sourceType: entry.sourceType },
    });

    revalidatePath(TOOL_PATH);
    return { success: true, message: '保存しました', data: entry };
  } catch (err) {
    logger.error('ai_kb:save_failed', err instanceof Error ? err.message : 'Unknown', { ...ctx, payload });
    return { success: false, message: '保存に失敗しました' };
  }
}

/**
 * ナレッジの論理削除
 */
export async function deleteKnowledgeEntryAction(knowledgeId: string) {
  const ctx = await getLogContext();
  try {
    await deleteKnowledgeEntry(knowledgeId);

    logger.info('ai_kb:delete_success', `Knowledge entry deleted: ${knowledgeId}`, { ...ctx, payload: { knowledgeId } });

    revalidatePath(TOOL_PATH);
    return { success: true, message: '削除しました' };
  } catch (err) {
    logger.error('ai_kb:delete_failed', err instanceof Error ? err.message : 'Unknown', { ...ctx, payload: { knowledgeId } });
    return { success: false, message: '削除に失敗しました' };
  }
}
