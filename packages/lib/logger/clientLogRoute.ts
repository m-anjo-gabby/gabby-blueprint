import 'server-only';
import { z } from 'zod';
import { createLogger, extractIpFromRequest, type LogService } from './index';
import { getLogContext } from './context';

/**
 * ブラウザのログ（packages/lib/logger/client.ts）の受け口。各アプリの app/api/client-log/route.ts で使う。
 * エラー画面（未ログインの画面を含む）からも送るため、proxy では公開ルートにする。
 * 誰でも送れる口のため、本文の大きさ・形・送信回数を制限し、ログには source: 'client' を付けてサーバーのログと区別する。
 */

const MAX_BODY_LENGTH = 16_000;
const RATE_LIMIT_PER_MINUTE = 60;

const bodySchema = z.object({
  event: z.string().max(100).regex(/^[a-z][A-Za-z0-9]*:[a-z0-9_]+$/),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string().max(1000),
  path: z.string().max(300).optional(),
  err: z.record(z.string(), z.unknown()).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

// IPごとの送信回数（インスタンス内のみの簡易な制限。ログの洪水を防ぐのが目的で、厳密さは求めない）
const counters = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  if (counters.size > 5_000) {
    for (const [k, v] of counters) if (v.resetAt <= now) counters.delete(k);
  }
  const current = counters.get(key);
  if (!current || current.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_PER_MINUTE;
}

export function createClientLogHandler(service: LogService) {
  const logger = createLogger(service);

  return async function POST(req: Request): Promise<Response> {
    if (isRateLimited(extractIpFromRequest(req) ?? 'unknown')) {
      return new Response(null, { status: 429 });
    }

    const text = await req.text();
    if (text.length > MAX_BODY_LENGTH) {
      return new Response(null, { status: 413 });
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return new Response(null, { status: 400 });
    }

    const { event, level, message, path, err, payload } = parsed.data;
    const ctx = await getLogContext();
    logger[level](event as `${string}:${string}`, message, {
      ...ctx,
      source: 'client',
      path,
      err,
      payload,
    });

    return new Response(null, { status: 204 });
  };
}
