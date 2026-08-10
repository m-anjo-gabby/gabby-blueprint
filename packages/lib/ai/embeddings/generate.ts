// packages/lib/ai/embeddings/generate.ts

import { embed } from 'ai';
import { googleEmbeddingModel } from '../providers/google';

export const EMBEDDING_MODEL = 'gemini-embedding-001';
/** com_m_ai_knowledge_base.embedding は vector(768) で定義されているため固定 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Geminiの埋め込みタスク種別。
 * ナレッジ登録時は RETRIEVAL_DOCUMENT、検索クエリ時は RETRIEVAL_QUERY を使うことで検索精度が上がる。
 */
export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export interface GenerateEmbeddingParams {
  text: string;
  taskType?: EmbeddingTaskType;
}

/**
 * テキストからEmbeddingベクトル（768次元）を生成する。
 */
export async function generateEmbedding({
  text,
  taskType = 'RETRIEVAL_DOCUMENT',
}: GenerateEmbeddingParams): Promise<number[]> {
  const { embedding } = await embed({
    model: googleEmbeddingModel(EMBEDDING_MODEL),
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType,
      },
    },
  });

  return embedding;
}
