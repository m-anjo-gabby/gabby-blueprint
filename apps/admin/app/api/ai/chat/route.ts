import { NextRequest, NextResponse } from 'next/server';
import {
  streamChatResponse,
  searchKnowledgeBase,
  formatKnowledgeMatchesAsContext,
  type ChatMessage,
  type KnowledgeSourceType,
} from '@gabby/lib/ai';
import { createLogger } from '@gabby/lib/logger';

const logger = createLogger('admin');

export const runtime = 'nodejs';

interface ChatRequestBody {
  message: string;
  history?: ChatMessage[];
  /** ヘルプアシスタント向けRAG検索を行うか */
  useKnowledgeBase?: boolean;
  /** RAG検索対象の区分。省略時は 'help' */
  knowledgeSourceType?: KnowledgeSourceType;
}

export interface KnowledgeSourceRef {
  title: string;
  similarity: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequestBody = await request.json();

    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    let context: string | undefined;
    let sources: KnowledgeSourceRef[] = [];

    if (body.useKnowledgeBase) {
      try {
        const matches = await searchKnowledgeBase({
          query: body.message,
          sourceType: body.knowledgeSourceType ?? 'help',
        });

        if (matches.length > 0) {
          context = formatKnowledgeMatchesAsContext(matches);
          sources = matches.map((m) => ({ title: m.title, similarity: m.similarity }));
        }
      } catch (ragError) {
        // RAG検索の失敗はチャット自体を止めず、コンテキストなしで継続する
        const message = ragError instanceof Error ? ragError.message : 'Unknown error';
        logger.warn('aiChat:rag_search_failed', message, { err: ragError });
      }
    }

    const result = streamChatResponse({
      message: body.message,
      history: body.history,
      context,
    });

    return result.toTextStreamResponse({
      headers: {
        'X-Knowledge-Sources': encodeURIComponent(JSON.stringify(sources)),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('aiChat:request_failed', message, { err: error });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
