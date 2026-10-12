import { NextResponse } from 'next/server';
import { createServerClient } from '../supabase/server';
import { createLogger } from '../logger';
import { sanitizeReturnTo } from './returnTo';

/**
 * `/auth/callback`（メール内リンクの受け口）の共通処理。各アプリの route.ts は
 * `export const GET = createAuthCallbackHandler('admin')` の1行にする。
 *
 * - パスワード再設定（type=recovery）: ここではトークンを確認せず、再設定画面へそのまま渡す
 *   （メーラーの事前読み込みでトークンが消費されないよう、画面のボタン操作でサーバーが確認する）
 * - PKCE（code）・Supabase 標準の招待（type=invite）: 後方互換のために残している受け口
 *   （独自の招待は /auth/invite が直接トークンを受け取るため、ここを通らない）
 */
export function createAuthCallbackHandler(appName: 'admin' | 'coach' | 'student', options: { defaultPath?: string } = {}) {
  const logger = createLogger(appName);
  const defaultPath = options.defaultPath ?? '/dashboard';

  return async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);

    const code = searchParams.get('code');
    // generateLink から直接届く場合、パラメータ名は token_hash / token のどちらもあり得る
    const tokenHash = searchParams.get('token_hash') || searchParams.get('token');
    const type = searchParams.get('type');
    // 外部サイトへの転送（例: next=@evil.com → https://app@evil.com）を防ぐため、アプリ内のパスだけを受け付ける
    const next = sanitizeReturnTo(searchParams.get('next')) ?? defaultPath;

    try {
      if (tokenHash && type === 'recovery') {
        const updatePasswordUrl = new URL(`${origin}/update-password`);
        updatePasswordUrl.searchParams.set('token_hash', tokenHash);
        updatePasswordUrl.searchParams.set('type', 'recovery');
        return NextResponse.redirect(updatePasswordUrl.toString());
      }

      const supabase = await createServerClient();

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          logger.warn('auth:callback_pkce_failed', error.message, { err: error });
          return NextResponse.redirect(`${origin}/login?error=auth`);
        }
        return NextResponse.redirect(`${origin}${next}`);
      }

      if (tokenHash && type === 'invite') {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
        if (error) {
          logger.warn('auth:callback_invite_failed', error.message, { err: error });
          return NextResponse.redirect(`${origin}/login?error=invite`);
        }
        return NextResponse.redirect(`${origin}${next}`);
      }

      return NextResponse.redirect(`${origin}/login`);
    } catch (err) {
      logger.error('auth:callback_unexpected', err instanceof Error ? err.message : 'Unknown error', { err });
      return NextResponse.redirect(`${origin}/login?error=callback`);
    }
  };
}
