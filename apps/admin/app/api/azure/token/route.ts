import { unstable_rethrow } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getAzureSpeechToken } from '@gabby/lib/azure/server';
import { createLogger } from '@gabby/lib/logger';
import { ADMIN_OR_CONTENT_MANAGER, checkAdminRoleForRoute } from '@/lib/adminAuth';

const logger = createLogger('admin');

export async function GET() {
  const { denied } = await checkAdminRoleForRoute(ADMIN_OR_CONTENT_MANAGER);
  if (denied) return denied;
  try {
    const token = await getAzureSpeechToken();
    return new NextResponse(token, { status: 200 });
  } catch (error) {
    unstable_rethrow(error);
    logger.error('azure:issue_token_failed', 'Failed to issue Azure Speech token', { err: error });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
