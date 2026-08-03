'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { upsertKnowledgeEntry, deleteKnowledgeEntry, type KnowledgeSourceType } from '@gabby/lib/ai';
import { revalidatePath } from 'next/cache';
import { createLogger, getLogContext } from '@gabby/lib/logger';

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

/**
 * ナレッジ一覧の取得（本文全文含む。embeddingベクトル自体は返さない）
 */
export async function getKnowledgeEntries(sourceType?: string): Promise<KnowledgeEntry[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    let query = supabase
      .from('com_m_ai_knowledge_base')
      .select('knowledge_id, source_type, title, body, metadata, embedding_model, update_date')
      .eq('delete_flg', '0')
      .order('update_date', { ascending: false });

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('ai_kb:list_failed', error.message, ctx);
      return [];
    }

    return data as KnowledgeEntry[];
  } catch (err) {
    logger.error('ai_kb:list_unexpected', err instanceof Error ? err.message : 'Unknown', ctx);
    return [];
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
