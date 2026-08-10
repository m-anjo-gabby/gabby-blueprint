import { headers } from 'next/headers';
import type { LogEvent } from './index';

/**
 * Middleware (proxy-base) でセットされたカスタムヘッダーから
 * 認証ユーザーID等のコンテキストを抽出する。
 * next/headers に依存するため、Server Component / Server Action からのみ import すること
 * （Middleware や Client Component から参照するとビルドエラーになる）。
 * * @returns {Promise<Partial<LogEvent>>} ログに付与するコンテキスト
 */
export async function getLogContext(): Promise<Partial<LogEvent>> {
  try {
    const h = await headers();
    const userId = h.get('x-user-id');
    const requestId = h.get('x-request-id');

    // IPアドレスの抽出 (Vercel環境では x-real-ip または x-forwarded-for を優先)
    const realIp = h.get('x-real-ip');
    const forwardedFor = h.get('x-forwarded-for');
    let ip = realIp || undefined;
    if (!ip && forwardedFor) {
      ip = forwardedFor.split(',')[0].trim();
    }

    return {
      userId: userId ?? 'system',
      ip: ip ?? undefined,
      requestId: requestId ?? undefined,
    };
  } catch {
    // Server Actions 以外（ビルド時や Edge Runtime 以外の特殊な文脈）でのフォールバック
    return { userId: 'system' };
  }
}
