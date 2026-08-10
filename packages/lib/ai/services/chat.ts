// packages/lib/ai/services/chat.ts

import { generateText, streamText, type ModelMessage } from 'ai';
import { google, DEFAULT_CHAT_MODEL } from '../providers/google';
import { buildHelpSystemPrompt } from '../prompts/help';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatServiceParams {
  /** 今回のユーザー発言 */
  message: string;
  /** これまでの会話履歴（新しい順ではなく発話順） */
  history?: ChatMessage[];
  /** 将来のRAG対応用: 検索で取得した参考情報を回答の根拠として渡す */
  context?: string;
}

function buildMessages({ message, history = [] }: ChatServiceParams): ModelMessage[] {
  return [
    ...history.map((m): ModelMessage => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];
}

/**
 * ヘルプアシスタント用: 単発の回答をまとめて取得する。
 */
export async function generateChatResponse(params: ChatServiceParams): Promise<string> {
  const { text } = await generateText({
    model: google(DEFAULT_CHAT_MODEL),
    system: buildHelpSystemPrompt(params.context),
    messages: buildMessages(params),
  });
  return text;
}

/**
 * ヘルプアシスタント用: ストリーミング応答が必要なUI（AI Playground等）向け。
 * 呼び出し元でResponseへの変換（toTextStreamResponse等）を行う。
 */
export function streamChatResponse(params: ChatServiceParams) {
  return streamText({
    model: google(DEFAULT_CHAT_MODEL),
    system: buildHelpSystemPrompt(params.context),
    messages: buildMessages(params),
  });
}
