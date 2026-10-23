import 'server-only';
import { NextResponse } from 'next/server';
import {
  encodeImpersonationCookie,
  IMPERSONATION_COOKIE_MAX_AGE_SECONDS,
  IMPERSONATION_COOKIE_NAME,
} from '../impersonation';
import { createLogger } from '../logger';
import { createAdminClient } from '../supabase/admin';
import { createServerClient } from '../supabase/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 管理者代理ログイン用のマジックリンクを確かめ、対象の本人のセッションを作る（apps/{student,coach} の
 * /auth/impersonate の本体）。apps/admin の startImpersonation() が発行したリンクからだけ来る想定。
 * 本人の画面には代理ログイン中であることを出さないため、imp_session Cookie（httpOnly）を付け、
 * 以降のログにだけ相関情報を残す。期限は無く、管理者がログアウトするまで続く。
 *
 * 監査の記録の使用（使い回しの拒否）を、本人のセッションを作るより先に行う。
 * 先にセッションを作ると、記録の確認に失敗してログイン画面へ移しても本人のセッションが残るため。
 */
export async function redeemImpersonation(request: Request, service: 'student' | 'coach'): Promise<NextResponse> {
  const logger = createLogger(service);
  const { origin, searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const impersonationId = searchParams.get('imp');

  if (!tokenHash || !impersonationId || !UUID_PATTERN.test(impersonationId)) {
    return NextResponse.redirect(`${origin}/login`);
  }
  const failedUrl = `${origin}/login?error=impersonation`;

  // DB側の監査ログを正とし、管理者・対象のIDはURLからではなく監査ログ行から取得する
  const { data: logRow, error: logError } = await createAdminClient()
    .from('com_t_admin_impersonation_log')
    .update({ redeemed_at: new Date().toISOString() })
    .eq('impersonation_id', impersonationId)
    .is('redeemed_at', null) // 二重消費（同じリンクの使い回し）を防ぐ
    .select('admin_id, target_user_id')
    .maybeSingle();

  if (logError || !logRow?.admin_id || !logRow.target_user_id) {
    logger.error(
      'impersonation:audit_log_update_failed',
      logError?.message || 'Log row not found or already redeemed',
      { err: logError, payload: { impersonationId } },
    );
    return NextResponse.redirect(failedUrl);
  }

  const supabase = await createServerClient();
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });

  if (verifyError || !verified.user) {
    logger.error('impersonation:verify_failed', verifyError?.message || 'User missing in verify response', {
      err: verifyError,
      payload: { impersonationId },
    });
    return NextResponse.redirect(failedUrl);
  }

  // リンクと監査の記録の対象が食い違う場合は、作ったセッションを捨てる
  if (verified.user.id !== logRow.target_user_id) {
    logger.error('impersonation:target_mismatch', 'Verified user differs from the audit log target', {
      userId: verified.user.id,
      payload: { impersonationId, targetUserId: logRow.target_user_id },
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(failedUrl);
  }

  logger.warn('impersonation:redeemed', 'Impersonation session established', {
    userId: verified.user.id,
    payload: { impersonationId, adminId: logRow.admin_id },
  });

  const response = NextResponse.redirect(`${origin}/dashboard`);
  response.cookies.set(
    IMPERSONATION_COOKIE_NAME,
    encodeImpersonationCookie({
      id: impersonationId,
      adminId: logRow.admin_id,
      targetUserId: logRow.target_user_id,
    }),
    {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: IMPERSONATION_COOKIE_MAX_AGE_SECONDS,
    },
  );

  return response;
}
