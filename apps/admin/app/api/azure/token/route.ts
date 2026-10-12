import { NextResponse } from 'next/server';
import { getAzureSpeechToken } from '@gabby/lib/azure/server';
import { createLogger } from '@gabby/lib/logger';

const logger = createLogger('admin');

export async function GET() {
  try {
    const token = await getAzureSpeechToken();
    return new NextResponse(token, { status: 200 });
  } catch (error) {
    logger.error('azure:issue_token_failed', 'Failed to issue Azure Speech token', { err: error });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}