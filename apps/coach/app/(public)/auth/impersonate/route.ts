import { NextResponse } from 'next/server';
import { createServerClient } from '@gabby/lib/supabase/server';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger } from '@gabby/lib/logger';
import {
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_TTL_MINUTES,
  encodeImpersonationCookie,
} from '@gabby/lib/impersonation';

const logger = createLogger('coach');

/**
 * 管理者代理ログイン用のマジックリンクを検証し、コーチ本人のセッションを確立するルート。
 * apps/admin の startImpersonation() で発行されたリンクからのみ遷移してくることを想定する。
 * コーチ側UIには代理ログイン中である旨を一切表示しない方針のため、
 * このルートで imp_session Cookie（非公開・httpOnly）をセットし、以降のログにのみ相関情報を残す。
 */
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const impersonationId = searchParams.get('imp');

  if (!tokenHash || !impersonationId) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createServerClient();

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });

  if (verifyError) {
    logger.error('impersonation:verify_failed', verifyError.message, { payload: { impersonationId } });
    return NextResponse.redirect(`${origin}/login?error=impersonation`);
  }

  // DB側の監査ログを正とし、admin_idをURLからではなく監査ログ行から取得する
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MINUTES * 60 * 1000);
  const adminClient = createAdminClient();
  const { data: logRow, error: logError } = await adminClient
    .from('com_t_admin_impersonation_log')
    .update({
      redeemed_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq('impersonation_id', impersonationId)
    .is('redeemed_at', null) // 二重消費（同じリンクの使い回し）を防ぐ
    .select('admin_id')
    .single();

  if (logError || !logRow?.admin_id) {
    logger.error('impersonation:audit_log_update_failed', logError?.message || 'Log row not found or already redeemed', { payload: { impersonationId } });
    return NextResponse.redirect(`${origin}/login?error=impersonation`);
  }

  logger.warn('impersonation:redeemed', 'Impersonation session established', {
    payload: { impersonationId, adminId: logRow.admin_id },
  });

  const response = NextResponse.redirect(`${origin}/dashboard`);
  response.cookies.set(
    IMPERSONATION_COOKIE_NAME,
    encodeImpersonationCookie({ id: impersonationId, adminId: logRow.admin_id, expiresAt: expiresAt.getTime() }),
    {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: IMPERSONATION_TTL_MINUTES * 60,
    }
  );

  return response;
}
