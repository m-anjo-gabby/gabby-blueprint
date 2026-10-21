import { unstable_rethrow } from 'next/navigation';
import { NextResponse, type NextRequest } from 'next/server';
import {
  formatKnowledgeMatchesAsContext,
  searchKnowledgeBase,
  streamChatResponse,
  type ChatMessage,
  type KnowledgeSourceType,
} from '@gabby/lib/ai';
import { createLogger } from '@gabby/lib/logger';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { ADMIN_OR_CONTENT_MANAGER, checkAdminRoleForRoute } from '@/lib/adminAuth';

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
  const { denied } = await checkAdminRoleForRoute(ADMIN_OR_CONTENT_MANAGER);
  if (denied) return denied;
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
        unstable_rethrow(ragError);
        // RAG検索の失敗はチャット自体を止めず、コンテキストなしで継続する
        const message = getErrorMessage(ragError);
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
    unstable_rethrow(error);
    const message = getErrorMessage(error);
    logger.error('aiChat:request_failed', message, { err: error });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
