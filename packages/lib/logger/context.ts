import { headers } from 'next/headers';
import type { LogEvent } from './index';
import { IMPERSONATION_REQUEST_HEADER_ID, IMPERSONATION_REQUEST_HEADER_ADMIN_ID } from '../impersonation';

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

    // 代理ログイン中のリクエストであれば、実際の操作(userId)とは別に
    // 「誰が代理で操作したか」をログに残せるよう相関情報を付与する
    const impersonationId = h.get(IMPERSONATION_REQUEST_HEADER_ID);
    const impersonationAdminId = h.get(IMPERSONATION_REQUEST_HEADER_ADMIN_ID);
    const impersonation = impersonationId && impersonationAdminId
      ? { id: impersonationId, adminId: impersonationAdminId }
      : undefined;

    return {
      userId: userId ?? 'system',
      ip: ip ?? undefined,
      requestId: requestId ?? undefined,
      ...(impersonation ? { impersonation } : {}),
    };
  } catch {
    // Server Actions 以外（ビルド時や Edge Runtime 以外の特殊な文脈）でのフォールバック
    return { userId: 'system' };
  }
}
