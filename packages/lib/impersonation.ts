/**
 * 管理者代理ログイン機能で共有する定数・Cookieエンコード/デコードユーティリティ。
 * apps/student の proxy.ts（デコード）と /auth/impersonate ルート（エンコード）から参照される。
 */

export const IMPERSONATION_COOKIE_NAME = 'imp_session';
export const IMPERSONATION_TTL_MINUTES = 30;
export const IMPERSONATION_REQUEST_HEADER_ID = 'x-impersonation-id';
export const IMPERSONATION_REQUEST_HEADER_ADMIN_ID = 'x-impersonation-admin-id';

export interface ImpersonationPayload {
  id: string;       // com_t_admin_impersonation_log.impersonation_id
  adminId: string;  // 代理ログインを実行した管理者のUUID
  expiresAt: number; // epoch ms
}

/**
 * Cookieに保存する値へエンコードする。
 * 秘匿情報（トークン等）は含まない相関ID・失効時刻のみを保持するため、署名は行わない
 * （生徒本人がブラウザ上で自身のCookieを改ざんしても、ログのタグ付け情報が乱れる程度に留まり、
 * 権限昇格や他ユーザーへのなりすましには繋がらない）。
 */
export function encodeImpersonationCookie(payload: ImpersonationPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

export function decodeImpersonationCookie(value: string | undefined | null): ImpersonationPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf-8'));
    if (
      typeof parsed?.id === 'string' &&
      typeof parsed?.adminId === 'string' &&
      typeof parsed?.expiresAt === 'number'
    ) {
      return parsed as ImpersonationPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function isImpersonationExpired(payload: ImpersonationPayload): boolean {
  return Date.now() > payload.expiresAt;
}
