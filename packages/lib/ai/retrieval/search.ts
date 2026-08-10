// packages/lib/ai/retrieval/search.ts

import { createAdminClient } from '../../supabase/admin';
import { generateEmbedding } from '../embeddings/generate';
import type { KnowledgeSourceType } from '../embeddings/knowledgeBase';

const MATCH_FUNCTION = 'match_ai_knowledge_base';

export interface SearchKnowledgeBaseParams {
  /** ユーザーの質問・検索クエリ */
  query: string;
  /** 絞り込み対象（help/coach/roleplay等）。省略時は全種別から検索 */
  sourceType?: KnowledgeSourceType;
  /** 取得件数上限 */
  matchCount?: number;
  /** コサイン類似度の下限（0〜1） */
  matchThreshold?: number;
}

export interface KnowledgeMatch {
  knowledgeId: string;
  sourceType: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

interface MatchAiKnowledgeBaseRow {
  knowledge_id: string;
  source_type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

/**
 * ユーザーの質問をEmbedding化し、pgvector（com_m_ai_knowledge_base）から類似度の高いナレッジを検索する。
 * DB側の検索関数: supabase/DDL/function/match_ai_knowledge_base.sql
 */
export async function searchKnowledgeBase({
  query,
  sourceType,
  matchCount = 5,
  matchThreshold = 0.5,
}: SearchKnowledgeBaseParams): Promise<KnowledgeMatch[]> {
  const queryEmbedding = await generateEmbedding({ text: query, taskType: 'RETRIEVAL_QUERY' });
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc(MATCH_FUNCTION, {
    _query_embedding: queryEmbedding,
    _source_type: sourceType ?? null,
    _match_count: matchCount,
    _match_threshold: matchThreshold,
  });

  if (error) {
    throw new Error(`Failed to search knowledge base: ${error.message}`);
  }

  return ((data ?? []) as MatchAiKnowledgeBaseRow[]).map((row) => ({
    knowledgeId: row.knowledge_id,
    sourceType: row.source_type,
    title: row.title,
    body: row.body,
    metadata: row.metadata,
    similarity: row.similarity,
  }));
}

/**
 * 検索結果をLLMのcontextにそのまま渡せるテキストへ整形する。
 * 例: searchKnowledgeBase() の結果を generateChatResponse({ context }) に渡す。
 */
export function formatKnowledgeMatchesAsContext(matches: KnowledgeMatch[]): string {
  return matches.map((m, i) => `[${i + 1}] ${m.title}\n${m.body}`).join('\n\n');
}
