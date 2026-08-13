'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { USER_TYPES } from "@gabby/types/user";

const logger = createLogger('admin');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StartImpersonationResult {
  success: boolean;
  url?: string;
  message?: string;
}

/**
 * 対象の生徒として生徒ポータルへ代理ログインするためのマジックリンクを発行する。
 * 障害対応・問合せ調査を目的とした機能のため、対象は生徒アカウントのみに限定する。
 * 発行のたびに監査ログ(com_t_admin_impersonation_log)へ理由付きで記録する。
 */
export async function startImpersonation(targetUserId: string, reason: string): Promise<StartImpersonationResult> {
  const ctx = await getLogContext();

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { success: false, message: '理由の入力は必須です' };
  }

  if (!ctx.userId || !UUID_PATTERN.test(ctx.userId)) {
    logger.error('impersonation:missing_admin_identity', 'Admin user id could not be resolved from request context', { ...ctx, payload: { targetUserId } });
    return { success: false, message: '管理者情報の取得に失敗しました。再ログイン後にお試しください' };
  }

  try {
    const supabase = createAdminClient();

    // 対象ユーザーが「生徒」であることを確認する（管理者・コーチへの代理ログインは対象外）
    const { data: targetUser, error: targetUserError } = await supabase
      .from('com_m_user')
      .select('id, user_type, user_name, delete_flg')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetUserError || !targetUser) {
      logger.error('impersonation:target_lookup_failed', targetUserError?.message || 'User not found', { ...ctx, payload: { targetUserId } });
      return { success: false, message: '対象ユーザーが見つかりませんでした' };
    }

    if (targetUser.user_type !== USER_TYPES.STUDENT || targetUser.delete_flg !== '0') {
      return { success: false, message: '生徒アカウントのみ代理ログインできます' };
    }

    // Authユーザー情報（メールアドレス）はcom_m_userに持たないため、Admin APIで別途取得
    const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(targetUserId);
    if (authUserError || !authUserData?.user?.email) {
      logger.error('impersonation:auth_user_lookup_failed', authUserError?.message || 'Auth user or email not found', { ...ctx, payload: { targetUserId } });
      return { success: false, message: '対象ユーザーの認証情報が見つかりませんでした' };
    }

    // 監査ログを先に記録し、発行したマジックリンクとの相関IDを採番する
    const { data: logRow, error: logError } = await supabase
      .from('com_t_admin_impersonation_log')
      .insert({
        admin_id: ctx.userId,
        target_user_id: targetUser.id,
        reason: trimmedReason,
      })
      .select('impersonation_id')
      .single();

    if (logError || !logRow) {
      logger.error('impersonation:audit_log_insert_failed', logError?.message || 'Insert failed', { ...ctx, payload: { targetUserId } });
      return { success: false, message: '監査ログの記録に失敗しました' };
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authUserData.user.email,
    });

    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      logger.error('impersonation:generate_link_failed', linkError?.message || 'hashed_token missing in response', { ...ctx, payload: { targetUserId, impersonationId: logRow.impersonation_id } });
      return { success: false, message: 'ログインリンクの発行に失敗しました' };
    }

    logger.warn('impersonation:started', `Admin started impersonation of user: ${authUserData.user.email}`, {
      ...ctx,
      payload: { impersonationId: logRow.impersonation_id, targetUserId: targetUser.id, reason: trimmedReason },
    });

    const studentBaseUrl = process.env.NEXT_PUBLIC_STUDENT_URL;
    if (!studentBaseUrl) {
      logger.error('impersonation:missing_student_url', 'NEXT_PUBLIC_STUDENT_URL is not configured', { ...ctx, payload: { targetUserId } });
      return { success: false, message: '生徒ポータルのURL設定が見つかりませんでした' };
    }

    const impersonateUrl = new URL('/auth/impersonate', studentBaseUrl);
    impersonateUrl.searchParams.set('token_hash', tokenHash);
    impersonateUrl.searchParams.set('imp', logRow.impersonation_id);

    return { success: true, url: impersonateUrl.toString() };
  } catch (error) {
    logger.error('impersonation:start_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { targetUserId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}
