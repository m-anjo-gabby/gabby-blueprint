import 'server-only';
import { cache } from 'react';
import type { UserAppMetadata } from '@supabase/supabase-js';
import { createServerClient } from './server';

/** リクエスト内の処理が使うログイン中のユーザー（JWT のクレームから組み立てる） */
export interface AuthUser {
  id: string;
  email: string | undefined;
  app_metadata: UserAppMetadata;
}

/**
 * ログイン中のユーザーを返す（未ログイン・トークン不正の場合は null）。サーバーアクション・Server Component 用。
 *
 * - 各リクエストは入口の proxy.ts で `auth.getUser()`（Auth サーバーへの問い合わせ。失効したセッションも弾く）を
 *   通過済みのため、ここでは `auth.getClaims()` で JWT を手元で検証するだけにする（署名鍵は非対称鍵で、
 *   公開鍵はプロセス内で共有してキャッシュされるため、通常は通信が発生しない）。
 * - React の `cache()` で1リクエスト内の呼び出しを1回にまとめる。
 * - 認証そのもの（ログイン・パスワード変更等）と入口の proxy.ts では使わず、`auth.getUser()` のままにする。
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    app_metadata: (claims.app_metadata ?? {}) as UserAppMetadata,
  };
});
