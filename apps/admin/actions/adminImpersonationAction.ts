'use server';

import { getTranslations } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import type { ActionResult } from '@gabby/types/action';
import { USER_STATUS, USER_TYPES } from '@gabby/types/user';
import { requireAdminRole, SYSTEM_ADMIN_ONLY } from '@/lib/adminAuth';

const logger = createLogger('admin');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StartImpersonationResult = ActionResult<{ url: string }>;

/**
 * 対象ユーザーとして生徒ポータル／コーチポータルへ代理ログインするためのマジックリンクを発行する。
 * 障害対応・問合せ調査を目的とした機能のため、対象は生徒・コーチアカウントのみに限定する。
 * 発行のたびに監査ログ(com_t_admin_impersonation_log)へ理由付きで記録する。
 */
export async function startImpersonation(targetUserId: string, reason: string): Promise<StartImpersonationResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { success: false, message: t('users.errors.reasonRequired') };
  }

  if (!ctx.userId || !UUID_PATTERN.test(ctx.userId)) {
    logger.error('impersonation:missing_admin_identity', 'Admin user id could not be resolved from request context', {
      ...ctx,
      payload: { targetUserId },
    });
    return { success: false, message: t('users.errors.adminInfoFailed') };
  }

  try {
    const supabase = createAdminClient();

    // 対象ユーザーが「生徒」または「コーチ」であることを確認する（管理者への代理ログインは対象外）
    const { data: targetUser, error: targetUserError } = await supabase
      .from('com_m_user')
      .select('id, user_type, user_name, status')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetUserError || !targetUser) {
      logger.error('impersonation:target_lookup_failed', targetUserError?.message || 'User not found', {
        ...ctx,
        err: targetUserError,
        payload: { targetUserId },
      });
      return { success: false, message: t('users.errors.userNotFound') };
    }

    const isImpersonatableType =
      targetUser.user_type === USER_TYPES.STUDENT || targetUser.user_type === USER_TYPES.COACH;
    if (!isImpersonatableType || targetUser.status !== USER_STATUS.ACTIVE) {
      return { success: false, message: t('users.errors.impersonateRoleOnly') };
    }

    // Authユーザー情報（メールアドレス）はcom_m_userに持たないため、Admin APIで別途取得
    const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(targetUserId);
    if (authUserError || !authUserData?.user?.email) {
      logger.error('impersonation:auth_user_lookup_failed', authUserError?.message || 'Auth user or email not found', {
        ...ctx,
        err: authUserError,
        payload: { targetUserId },
      });
      return { success: false, message: t('users.errors.authUserNotFound') };
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
      logger.error('impersonation:audit_log_insert_failed', logError?.message || 'Insert failed', {
        ...ctx,
        err: logError,
        payload: { targetUserId },
      });
      return { success: false, message: t('users.errors.auditLogFailed') };
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authUserData.user.email,
    });

    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      logger.error('impersonation:generate_link_failed', linkError?.message || 'hashed_token missing in response', {
        ...ctx,
        err: linkError,
        payload: { targetUserId, impersonationId: logRow.impersonation_id },
      });
      return { success: false, message: t('users.errors.loginLinkFailed') };
    }

    logger.warn('impersonation:started', 'Admin started impersonation', {
      ...ctx,
      // 理由は自由記述で個人情報を含み得るため、ログには出さず監査の記録（DB）にだけ残す
      payload: { impersonationId: logRow.impersonation_id, targetUserId: targetUser.id },
    });

    const portalEnvKey =
      targetUser.user_type === USER_TYPES.COACH ? 'NEXT_PUBLIC_COACH_URL' : 'NEXT_PUBLIC_STUDENT_URL';
    const portalBaseUrl = process.env[portalEnvKey];
    if (!portalBaseUrl) {
      logger.error('impersonation:missing_portal_url', `${portalEnvKey} is not configured`, {
        ...ctx,
        payload: { targetUserId },
      });
      return { success: false, message: t('users.errors.portalUrlMissing') };
    }

    const impersonateUrl = new URL('/auth/impersonate', portalBaseUrl);
    impersonateUrl.searchParams.set('token_hash', tokenHash);
    impersonateUrl.searchParams.set('imp', logRow.impersonation_id);

    return { success: true, url: impersonateUrl.toString() };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('impersonation:start_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { targetUserId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}
