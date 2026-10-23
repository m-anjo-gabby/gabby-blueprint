/**
 * 管理者代理ログイン機能で共有する定数・Cookieエンコード/デコードユーティリティ。
 * apps/{student,coach} の proxy.ts（デコード）と /auth/impersonate ルート（エンコード）から参照される。
 * 代理ログインに期限は無く、管理者が代理ログイン先でログアウトするまで続く（運用の手順で守る）。
 * その間の操作のログに代理ログインの印を付け続けることを優先し、Cookie は認証の Cookie と同じだけ残す。
 */

export const IMPERSONATION_COOKIE_NAME = 'imp_session';
/** @supabase/ssr の認証の Cookie の既定の maxAge（400日）に合わせ、本人のセッションより先に印だけが消えないようにする */
export const IMPERSONATION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
export const IMPERSONATION_REQUEST_HEADER_ID = 'x-impersonation-id';
export const IMPERSONATION_REQUEST_HEADER_ADMIN_ID = 'x-impersonation-admin-id';

export interface ImpersonationPayload {
  id: string; // com_t_admin_impersonation_log.impersonation_id
  adminId: string; // 代理ログインを実行した管理者のUUID
  targetUserId: string; // 代理ログインの対象（ログイン中の本人）のUUID
}

/**
 * Cookieに保存する値へエンコードする。
 * 秘匿情報（トークン等）は含まない相関ID（代理ログイン・管理者・対象のID）のみを保持するため、署名は行わない
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
      typeof parsed?.targetUserId === 'string'
    ) {
      return parsed as ImpersonationPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * ログイン中の本人への代理ログインの Cookie であれば、その内容を返す。
 * ログアウト後に別のユーザーでログインした場合等、本人と違う Cookie は使わない（別人の操作に印を付けない）。
 */
export function resolveImpersonation(
  cookieValue: string | undefined | null,
  userId: string | undefined,
): ImpersonationPayload | null {
  const payload = decodeImpersonationCookie(cookieValue);
  if (!payload || !userId || payload.targetUserId !== userId) return null;
  return payload;
}
