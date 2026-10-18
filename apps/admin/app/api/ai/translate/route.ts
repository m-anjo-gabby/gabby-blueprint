import { unstable_rethrow } from 'next/navigation';
import { type NextRequest, NextResponse } from 'next/server';
import { checkAdminRoleForRoute, ADMIN_OR_CONTENT_MANAGER } from '@/lib/adminAuth';
import { translateEnglish } from '@gabby/lib/ai';
import { createLogger } from '@gabby/lib/logger';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';

const logger = createLogger('admin');

export const runtime = 'nodejs';

interface TranslateRequestBody {
  text: string;
  includeExplanation?: boolean;
}

export async function POST(request: NextRequest) {
  const { denied } = await checkAdminRoleForRoute(ADMIN_OR_CONTENT_MANAGER);
  if (denied) return denied;
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
    unstable_rethrow(error);
    const message = getErrorMessage(error);
    logger.error('aiTranslate:request_failed', message, { err: error });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
