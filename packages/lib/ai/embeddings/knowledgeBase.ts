// packages/lib/ai/embeddings/knowledgeBase.ts

import { createAdminClient } from '../../supabase/admin';
import { EMBEDDING_MODEL, generateEmbedding } from './generate';

const TABLE_NAME = 'com_m_ai_knowledge_base';

/** com_m_ai_knowledge_base.source_type の想定値。DB側にCHECK制約はなく今後追加可能 */
export type KnowledgeSourceType = 'help' | 'coach' | 'roleplay' | (string & {});

export interface KnowledgeBaseEntry {
  knowledgeId: string;
  sourceType: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

export interface UpsertKnowledgeEntryParams {
  /** 更新する場合に指定。省略時は新規登録 */
  knowledgeId?: string;
  sourceType: KnowledgeSourceType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

interface KnowledgeBaseRow {
  knowledge_id: string;
  source_type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

/**
 * ナレッジ本文（body）からEmbeddingを生成し、com_m_ai_knowledge_baseへ登録/更新する。
 * ヘルプ記事・AIコーチ知識・ロールプレイシナリオなど、source_typeを問わず共通で使う。
 */
export async function upsertKnowledgeEntry(params: UpsertKnowledgeEntryParams): Promise<KnowledgeBaseEntry> {
  const embedding = await generateEmbedding({ text: params.body, taskType: 'RETRIEVAL_DOCUMENT' });
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(
      {
        ...(params.knowledgeId ? { knowledge_id: params.knowledgeId } : {}),
        source_type: params.sourceType,
        title: params.title,
        body: params.body,
        metadata: params.metadata ?? {},
        embedding,
        embedding_model: EMBEDDING_MODEL,
        created_by: params.createdBy,
        update_date: new Date().toISOString(),
      },
      { onConflict: 'knowledge_id' }
    )
    .select('knowledge_id, source_type, title, body, metadata')
    .single<KnowledgeBaseRow>();

  if (error) {
    throw new Error(`Failed to upsert knowledge base entry: ${error.message}`);
  }

  return {
    knowledgeId: data.knowledge_id,
    sourceType: data.source_type,
    title: data.title,
    body: data.body,
    metadata: data.metadata,
  };
}

/**
 * ナレッジを論理削除する（delete_flg='1'）。
 */
export async function deleteKnowledgeEntry(knowledgeId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ delete_flg: '1', update_date: new Date().toISOString() })
    .eq('knowledge_id', knowledgeId);

  if (error) {
    throw new Error(`Failed to delete knowledge base entry: ${error.message}`);
  }
}
