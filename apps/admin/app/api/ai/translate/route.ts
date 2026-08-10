import { NextRequest, NextResponse } from 'next/server';
import { translateEnglish } from '@gabby/lib/ai';

export const runtime = 'nodejs';

interface TranslateRequestBody {
  text: string;
  includeExplanation?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: TranslateRequestBody = await request.json();

    if (!body.text || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const result = await translateEnglish({
      text: body.text,
      includeExplanation: body.includeExplanation ?? true,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Translate API Error:', message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
