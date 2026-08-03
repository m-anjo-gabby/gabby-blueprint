// packages/lib/ai/prompts/help.ts

/**
 * ヘルプアシスタント用システムプロンプト。
 * 将来、RAG検索で取得したヘルプ記事を context として渡し、回答の根拠にする想定。
 */
export function buildHelpSystemPrompt(context?: string): string {
  const base = `You are the in-app help assistant for "Gabby Blueprint English", an English learning platform.
Answer the user's question clearly and concisely.
Always reply in the same language the user used to ask the question.
If you are not confident about the answer, say so honestly instead of guessing.`;

  if (!context) {
    return base;
  }

  return `${base}

Use the following reference material to answer the question. If the reference material does not contain the answer, rely on your general knowledge but mention that the answer is not covered by the reference material.

--- Reference Material ---
${context}
--- End of Reference Material ---`;
}
