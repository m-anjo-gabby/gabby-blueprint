// packages/lib/ai/providers/google.ts

import { createGoogleGenerativeAI } from '@ai-sdk/google';

export const DEFAULT_CHAT_MODEL = 'gemini-flash-lite-latest';
export const DEFAULT_TRANSLATION_MODEL = 'gemini-flash-lite-latest';

let provider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

/**
 * GEMINI_API_KEY はビルド時ではなく初回呼び出し時に検証する。
 * Provider生成をモジュール読込時に行うと、env未設定のビルド環境でimportが失敗するため。
 */
function getGoogleProvider() {
  if (!provider) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set.');
    }
    provider = createGoogleGenerativeAI({ apiKey });
  }
  return provider;
}

/**
 * Geminiの言語モデルを取得する共通関数。
 * アプリ側はProvider実装を意識せず、このモデルIDだけで呼び出す。
 *
 * @example
 * google('gemini-2.5-flash-lite')
 */
export function google(modelId: string) {
  return getGoogleProvider()(modelId);
}

/**
 * Geminiの埋め込み（Embedding）モデルを取得する共通関数。
 * RAG用のEmbedding生成・検索（packages/lib/ai/embeddings, retrieval）で使用する。
 */
export function googleEmbeddingModel(modelId: string) {
  return getGoogleProvider().textEmbeddingModel(modelId);
}
