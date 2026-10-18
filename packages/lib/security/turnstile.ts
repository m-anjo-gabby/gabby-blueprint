/**
 * Cloudflare Turnstile（CAPTCHA）のサーバー側の検証（サーバー専用）。
 * ログイン不要の公開フォーム（student の Webトライアルの申込 /trial）で、ブラウザのウィジェットが返したトークンを確かめる。
 * 秘密鍵（TURNSTILE_SECRET_KEY）が未設定の場合は受け付けない（設定漏れで素通りさせない）。
 * dev・staging・手元は Cloudflare のテスト用の鍵（常に成功する）を使う（scripts/vercel-env/manifest.mjs）。
 */
import 'server-only';
import { createLogger, type LogContext } from '../logger';

const logger = createLogger('common');

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 10_000;

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

export async function verifyTurnstileToken(token: string, ctx: LogContext): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    logger.error('security:turnstile_not_configured', 'TURNSTILE_SECRET_KEY is not set', ctx);
    return false;
  }
  if (!token) return false;

  try {
    const body = new FormData();
    body.append('secret', secret);
    body.append('response', token);
    if (ctx.ip) body.append('remoteip', ctx.ip);
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
    const result = (await res.json()) as SiteverifyResponse;
    if (!result.success) {
      logger.warn('security:turnstile_denied', 'Turnstile verification failed', {
        ...ctx,
        payload: { errorCodes: result['error-codes'] },
      });
    }
    return result.success;
  } catch (err) {
    logger.error('security:turnstile_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      err,
    });
    return false;
  }
}
