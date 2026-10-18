'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { upsertKnowledgeEntry, deleteKnowledgeEntry, type KnowledgeSourceType } from '@gabby/lib/ai';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { ilikeAny } from '@gabby/lib/supabase/ilike';
import { toRange, type ListParams, type ListResult } from '@/lib/list';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';

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
 * ナレッジ一覧の取得（サーバーサイドページネーション）。
 * 本文全文を含むがembeddingベクトル自体は返さない。
 */
export async function getKnowledgeEntries(params: ListParams<'type'>): Promise<ListResult<KnowledgeEntry>> {
  const ctx = await getLogContext();
  const {
    q,
    filters: { type: sourceType },
  } = params;
  try {
    const supabase = await createAdminClient();
    const [from, to] = toRange(params);

    let query = supabase
      .from('com_m_ai_knowledge_base')
      .select('knowledge_id, source_type, title, body, metadata, embedding_model, update_date', { count: 'exact' })
      .order('update_date', { ascending: false })
      .order('knowledge_id', { ascending: true }) // 同順位の並びを一意に固定し、range(LIMIT/OFFSET)でのページ間の重複・欠落を防ぐ
      .range(from, to);

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    if (q) {
      query = query.or(ilikeAny(['title', 'body'], q));
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error('aiKb:list_failed', error.message, { ...ctx, err: error, payload: { from, to, sourceType } });
      return { rows: [], totalCount: 0 };
    }

    return { rows: data as KnowledgeEntry[], totalCount: count || 0 };
  } catch (err) {
    logger.error('aiKb:list_unexpected', getErrorMessage(err, 'Unknown'), {
      ...ctx,
      err,
      payload: { sourceType },
    });
    return { rows: [], totalCount: 0 };
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

    logger.info('aiKb:save_success', `Knowledge entry saved: ${entry.title}`, {
      ...ctx,
      payload: { knowledgeId: entry.knowledgeId, sourceType: entry.sourceType },
    });

    revalidatePath(TOOL_PATH);
    return { success: true, message: '保存しました', data: entry };
  } catch (err) {
    logger.error('aiKb:save_failed', getErrorMessage(err, 'Unknown'), { ...ctx, err, payload });
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

    logger.info('aiKb:delete_success', `Knowledge entry deleted: ${knowledgeId}`, { ...ctx, payload: { knowledgeId } });

    revalidatePath(TOOL_PATH);
    return { success: true, message: '削除しました' };
  } catch (err) {
    logger.error('aiKb:delete_failed', getErrorMessage(err, 'Unknown'), {
      ...ctx,
      err,
      payload: { knowledgeId },
    });
    return { success: false, message: '削除に失敗しました' };
  }
}
