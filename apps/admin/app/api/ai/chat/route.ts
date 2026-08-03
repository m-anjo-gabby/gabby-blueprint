import { NextRequest, NextResponse } from 'next/server';
import { streamChatResponse, type ChatMessage } from '@gabby/lib/ai';

export const runtime = 'nodejs';

interface ChatRequestBody {
  message: string;
  history?: ChatMessage[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequestBody = await request.json();

    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const result = streamChatResponse({
      message: body.message,
      history: body.history,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Chat API Error:', message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
