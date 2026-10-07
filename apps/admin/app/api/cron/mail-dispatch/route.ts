import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { dispatchMail } from '@gabby/lib/mail/dispatch/dispatchMail';
import { sendMailDailyReport } from '@gabby/lib/mail/dispatch/dailyReport';
import { createLogger } from '@gabby/lib/logger';

const logger = createLogger('mail');

// 送信は1件ずつ行うため、既定の実行時間では足りないことがある
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Authorization: Bearer <CRON_SECRET> を確かめる（未設定の環境では常に拒否する） */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** 実行する処理（POST の JSON の task、または GET の ?task=。既定は送信処理） */
async function readTask(req: NextRequest): Promise<string | null> {
  if (req.method !== 'POST') return req.nextUrl.searchParams.get('task');
  try {
    const body: unknown = await req.json();
    return body && typeof body === 'object' && 'task' in body && typeof body.task === 'string' ? body.task : null;
  } catch {
    return null;
  }
}

/**
 * 通知・リマインダーのメールの送信処理（pg_cron が pg_net で5分ごとに呼ぶ。supabase/DDL/function/invoke_mail_dispatch.sql）。
 * task=daily_report は運営向けのメール配信の日次の要約（毎日のジョブ 'mail-daily-report'。packages/lib/mail/dispatch/dailyReport.ts）。
 * 本体は packages/lib/mail/dispatch/dispatchMail.ts。ログインは不要で、秘密のキー（CRON_SECRET）で保護する。
 * Vercel Cron（GET）からも呼べるよう GET と POST の両方を受け付ける。
 */
async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    if ((await readTask(req)) === 'daily_report') {
      return NextResponse.json(await sendMailDailyReport());
    }
    const summary = await dispatchMail();
    return NextResponse.json(summary);
  } catch (err) {
    logger.error('mail:dispatch_route_failed', err instanceof Error ? err.message : 'Unknown error', { err });
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
