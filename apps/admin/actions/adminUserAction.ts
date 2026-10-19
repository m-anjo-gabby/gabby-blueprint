'use server';

import { randomBytes } from 'crypto'; // 暗号トークン生成用

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { validatePasswordStrength } from '@gabby/lib/auth/validation'; // パスワード強度の共通バリデーション
import { formatToJstDate } from '@gabby/lib/date/date';
import { issueInitialLicense, resolvePerformedBy } from '@gabby/lib/license/issue';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { INVITATION_EXPIRES_DAYS, sendInvitationEmail } from '@gabby/lib/mail/actions/sendAccountMail'; // 招待メール（ユーザー種別ごとのテンプレート・文言で送り分け）

import { getPortalBaseUrl } from '@gabby/lib/navigation/portalUrl';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { exactPattern, ilikeAny } from '@gabby/lib/supabase/ilike';
import type { ActionResult } from '@gabby/types/action';
import {
  isUserType,
  type BulkImportResponse,
  type BulkImportResultDetail,
  type BulkUser,
  type CreateUserPayload,
  type CreateUserResponse,
  type RoleDefinition,
  type UserRecord,
} from '@gabby/types/user';
import { requireAdminRole, SYSTEM_ADMIN_ONLY } from '@/lib/adminAuth';
import { toRange, type ListParams, type ListResult } from '@/lib/list';

const logger = createLogger('admin');

/**
 * ユーザ種別に応じたリダイレクト先（招待画面のベースURL）を解決する共通ヘルパー
 */
function getRedirectBase(userType?: string): string {
  return getPortalBaseUrl(userType);
}

/**
 * トークン付きの最終的な招待リダイレクトURLを生成する共通ヘルパー
 */
function getInvitationUrl(userType: string | undefined, token: string): string {
  const base = getRedirectBase(userType);
  return `${base}/auth/invite?token=${token}`;
}

/**
 * 招待リンクの有効期限（送信から INVITATION_EXPIRES_DAYS 日後）を生成するヘルパー
 */
function getInvitationExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRES_DAYS);
  return expiresAt;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * 招待・即時作成の前に、メールアドレスが使われていないかを確かめる（大文字小文字は区別しない）。
 * - 認証のアカウントがある（削除済みのユーザーを含む）→ 登録済み
 * - 本登録前の招待がある → 招待中（再送で対応する）
 * - 本登録済みの招待が残っているがアカウントが無い（ユーザーを削除した）→ 古い招待を消して使えるようにする
 * 戻り値はエラーの文言の翻訳キー（使えるなら null）。
 */
async function checkEmailAvailable(
  supabase: AdminClient,
  email: string,
): Promise<'users.errors.emailExists' | 'users.errors.emailInviting' | null> {
  const { data: authUserId, error: authError } = await supabase.rpc('fn_find_auth_user_id_by_email', {
    p_email: email,
  });
  if (authError) throw authError;
  if (authUserId) return 'users.errors.emailExists';

  const { data: invitation, error: invitationError } = await supabase
    .from('com_t_invitation')
    .select('id, accepted_at')
    .ilike('email', exactPattern(email.trim()))
    .maybeSingle();
  if (invitationError) throw invitationError;
  if (!invitation) return null;
  if (!invitation.accepted_at) return 'users.errors.emailInviting';

  const { error: deleteError } = await supabase.from('com_t_invitation').delete().eq('id', invitation.id);
  if (deleteError) throw deleteError;
  return null;
}

/**
 * ユーザ情報の一覧取得（ページネーション・氏名/メール/顧客名の部分一致検索・顧客/区分での絞り込み）
 */
export async function getUsers(params: ListParams<'clientId' | 'userType'>): Promise<ListResult<UserRecord>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  const {
    q,
    filters: { clientId, userType },
  } = params;
  try {
    const supabase = await createAdminClient();
    const [from, to] = toRange(params);

    let query = supabase.schema('private').from('vw_user_list').select('*', { count: 'exact' });

    if (q) {
      query = query.or(ilikeAny(['user_name', 'email', 'client_name'], q));
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (isUserType(userType)) {
      query = query.eq('user_type', userType);
    }

    const { data, error, count } = await query
      .order('insert_date', { ascending: false }) // 最新の招待・登録者が一番上に来るように降順
      .order('id', { ascending: true }) // 同順位の並びを一意に固定し、range(LIMIT/OFFSET)でのページ間の重複・欠落を防ぐ
      .range(from, to);

    if (error) {
      logger.error('user:get_users_failed', error.message, {
        ...ctx,
        err: error,
        payload: { from, to, clientId, userType },
      });
      throw error;
    }

    const rows = (data || []).map((user) => ({
      ...user,
      license_start_date: user.license_start_date ? formatToJstDate(user.license_start_date) : null,
      license_end_date: user.license_end_date ? formatToJstDate(user.license_end_date) : null,
    })) as UserRecord[];

    return {
      rows,
      totalCount: count || 0,
    };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('user:get_users_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { clientId, userType },
    });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * ユーザー1件の取得（詳細画面用。一覧と同じ項目）。見つからない場合は null
 */
export async function getUserById(id: string): Promise<UserRecord | null> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  if (!z.uuid().safeParse(id).success) return null;

  const supabase = await createAdminClient();
  const { data, error } = await supabase.schema('private').from('vw_user_list').select('*').eq('id', id).maybeSingle();

  if (error) {
    logger.error('user:get_user_failed', error.message, { ...ctx, err: error, payload: { id } });
    throw error;
  }
  if (!data) return null;

  return {
    ...data,
    license_start_date: data.license_start_date ? formatToJstDate(data.license_start_date) : null,
    license_end_date: data.license_end_date ? formatToJstDate(data.license_end_date) : null,
  } as UserRecord;
}

/**
 * ユーザー登録アクション
 */
export async function createUser(
  payload: CreateUserPayload & { roles?: string[]; contract_id?: string },
): Promise<CreateUserResponse> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  const { email, user_name, client_id, user_type, roles = [], contract_id } = payload;

  try {
    const supabase = await createAdminClient();

    // 登録済み・招待中のアドレスでないか先に確認します
    const conflict = await checkEmailAvailable(supabase, email);
    if (conflict) {
      return { success: false, user_id: null, errorType: 'email_exists', message: t(conflict) };
    }

    // 招待の有効期限（INVITATION_EXPIRES_DAYS 日）
    const expiresAt = getInvitationExpiry();

    // 暗号論的に安全なランダムトークンを生成
    const invitationToken = randomBytes(32).toString('hex');

    // 1. 招待を登録する（アカウントは本登録のときに作る）
    const { data: inviteData, error } = await supabase
      .from('com_t_invitation')
      .insert({
        email,
        user_name,
        user_type,
        client_id: client_id || null,
        contract_id: contract_id === 'none' ? null : contract_id || null, // 'none'の場合はnullに変換
        roles,
        token: invitationToken,
        expires_at: expiresAt.toISOString(),
        invited_by: ctx.userId || null,
      })
      .select('id, token')
      .single();

    if (error) {
      if (error.code === '23505') {
        // Postgresの一意制約違反（確認の直後に同じメールアドレスで招待された場合）
        return { success: false, user_id: null, errorType: 'email_exists', message: t('users.errors.emailInviting') };
      }
      logger.error('user:create_user_invite_failed', error.message, { ...ctx, err: error, payload });
      return { success: false, user_id: null, errorType: 'unexpected_error', message: t('common.errors.unexpected') };
    }

    if (!inviteData) {
      return {
        success: false,
        user_id: null,
        errorType: 'unexpected_error',
        message: t('users.errors.createDataFailed'),
      };
    }

    const userId = inviteData.id; // 既存機能（一括インポートなど）との互換性のため、発行された招待ID(UUID)を仮のuserIdとして引き継ぐ

    // 2. ロール（com_t_user_role）は本登録のときに紐付ける（招待には配列で保存済み）
    /*
    if (roles.length > 0) {
      const { error: roleError } = await supabase
        .from('com_t_user_role')
        .insert(roles.map(roleId => ({ user_id: userId, role_id: roleId })));
      
      if (roleError) {
        logger.error('user:create_user_role_insert_failed', roleError.message, { ...ctx, err: roleError, payload: { userId, roles } });
      }
    }
    */

    // 招待メールを送る（ユーザー種別ごとの文面・リンク先で送り分ける）
    const inviteUrl = getInvitationUrl(user_type, inviteData.token);
    const mailResult = await sendInvitationEmail({
      to: email,
      userType: user_type,
      // 氏名が無ければ空で渡し、宛名は各テンプレートの既定（会員様 / Dear Coach / 管理者様）に任せる
      userName: user_name || '',
      inviteUrl: inviteUrl,
      expiresDays: INVITATION_EXPIRES_DAYS,
    });

    // メール送信結果をDBに記録
    await supabase
      .from('com_t_invitation')
      .update({
        mail_sent_at: mailResult.success ? new Date().toISOString() : null,
        last_mail_error: mailResult.success ? null : mailResult.error || 'Unknown Error',
      })
      .eq('id', userId);

    if (!mailResult.success) {
      logger.error('user:create_user_mail_dispatch_failed', mailResult.error || 'Unknown error', {
        ...ctx,
        payload: { email },
      });
      // メール送信に失敗しても、レコードは作成されているため管理画面一覧からいつでも「再送」が可能です。
    }

    logger.info('user:create_user_success', `User invited: ${email}`, {
      ...ctx,
      payload: { userId, email, clientId: client_id },
    });

    revalidatePath('/users', 'layout');
    return {
      success: true,
      user_id: userId,
      errorType: null,
      message: mailResult.success ? null : mailResult.error || t('users.errors.inviteMailFailed'),
    };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('user:create_user_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload,
    });
    return { success: false, user_id: null, errorType: 'unexpected_error', message: t('common.errors.unexpected') };
  }
}

/**
 * ユーザー即時作成アクション（Auto Confirm）
 * Supabaseダッシュボードの「Auto Confirm」相当。招待メールを送信せず、
 * 管理者がその場で指定したメールアドレス・パスワードで確認済みアカウントを作成します。
 */
export async function createUserDirect(
  payload: CreateUserPayload & { roles?: string[]; contract_id?: string; password: string },
): Promise<CreateUserResponse> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  const { email, user_name, client_id, user_type, roles = [], contract_id, password } = payload;

  try {
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return { success: false, user_id: null, errorType: 'weak_password', message: passwordError };
    }

    const supabase = await createAdminClient();

    // 登録済み・招待中のアドレスでないか先に確認します（招待中のアドレスに作ると、残った招待のリンクで本登録できなくなる）
    const conflict = await checkEmailAvailable(supabase, email);
    if (conflict) {
      return { success: false, user_id: null, errorType: 'email_exists', message: t(conflict) };
    }

    // Supabase Auth側へ確認済み(email_confirm: true)のユーザーとして即時作成
    // ※ 既存のDBトリガーにより、public.com_m_user への基本レコードの自動同期が行われます
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        user_name,
        user_type,
        client_id: client_id || null,
        roles,
      },
    });

    if (authError || !authData.user) {
      if (authError?.code === 'email_exists') {
        return { success: false, user_id: null, errorType: 'email_exists', message: t('users.errors.emailExists') };
      }
      logger.error('user:create_user_direct_auth_failed', authError?.message || 'User object null', {
        ...ctx,
        err: authError,
        payload: { email },
      });
      return {
        success: false,
        user_id: null,
        errorType: 'unexpected_error',
        message: t('users.errors.createAccountFailed'),
      };
    }

    const userId = authData.user.id;

    // 各サブステップの失敗はthrowせず処理を継続するため、最終ログで欠落なく可視化できるよう記録しておく
    const partialFailures: string[] = [];

    // トリガーで自動作成されたマスタレコード(com_m_user)を確定情報でアップデート
    const { error: dbUserError } = await supabase
      .from('com_m_user')
      .update({
        client_id: client_id || null,
        user_name,
        user_type,
        update_date: new Date().toISOString(),
      })
      .eq('id', userId);

    if (dbUserError) {
      partialFailures.push('com_m_user_sync');
      logger.error('user:create_user_direct_sync_failed', dbUserError.message, {
        ...ctx,
        err: dbUserError,
        payload: { userId },
      });
    }

    // ロールの紐付け
    if (roles.length > 0) {
      const { error: roleError } = await supabase
        .from('com_t_user_role')
        .insert(roles.map((roleId) => ({ user_id: userId, role_id: roleId })));

      if (roleError) {
        partialFailures.push('role_insert');
        logger.error('user:create_user_direct_role_insert_failed', roleError.message, {
          ...ctx,
          err: roleError,
          payload: { userId, roles },
        });
      }
    }

    // 初期ライセンスの割当（生徒など、契約が指定された場合のみ）
    // 契約管理からの割当と同じく、履歴・ライブのチケットも作る（@gabby/lib/license/issue）
    if (contract_id && contract_id !== 'none') {
      const licenseResult = await issueInitialLicense(
        supabase,
        {
          contractId: contract_id,
          userId,
          performedBy: resolvePerformedBy(ctx.userId),
        },
        ctx,
      );
      if (!licenseResult.success) {
        partialFailures.push('license_insert');
        logger.error('user:create_user_direct_license_insert_failed', licenseResult.message, {
          ...ctx,
          payload: { userId, contract_id },
        });
      }
    }

    if (partialFailures.length > 0) {
      // 一部サブステップが失敗した状態。障害調査で成功ログに埋もれないようwarnで区別する
      logger.warn('user:create_user_direct_partial_success', `User created with partial failures: ${email}`, {
        ...ctx,
        payload: { userId, email, clientId: client_id, partialFailures },
      });
    } else {
      logger.info('user:create_user_direct_success', `User created directly (auto-confirmed): ${email}`, {
        ...ctx,
        payload: { userId, email, clientId: client_id },
      });
    }

    revalidatePath('/users', 'layout');
    return { success: true, user_id: userId, errorType: null, message: null };
  } catch (err) {
    unstable_rethrow(err);
    // セキュリティ: payloadには平文パスワードが含まれるため、ログにはそのまま渡さない
    logger.error('user:create_user_direct_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { ...payload, password: undefined },
    });
    return { success: false, user_id: null, errorType: 'unexpected_error', message: t('common.errors.unexpected') };
  }
}

/**
 * ユーザー再招待招待アクション
 */
export async function resendInvite(email: string, userType?: string): Promise<ActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 本登録前（accepted_at IS NULL）の招待を取得する
    const { data: currentInvite, error: fetchError } = await supabase
      .from('com_t_invitation')
      .select('*')
      .eq('email', email)
      .is('accepted_at', null)
      .maybeSingle();

    if (fetchError || !currentInvite) {
      logger.warn('user:resend_invite_not_found', `No active invitation found for: ${email}`, { ...ctx });
      return { success: false, message: t('users.errors.invitationNotFound') };
    }

    // 再送のたびに有効期限を送信時点から付け直し、トークンも作り直す（古いリンクを使えなくする）
    const newExpiresAt = getInvitationExpiry();
    const newWeightToken = randomBytes(32).toString('hex');

    const { error: updateError } = await supabase
      .from('com_t_invitation')
      .update({
        token: newWeightToken,
        expires_at: newExpiresAt.toISOString(),
        update_date: new Date().toISOString(),
      })
      .eq('id', currentInvite.id);

    if (updateError) {
      logger.error('user:resend_invite_failed', updateError.message, { ...ctx, err: updateError, payload: { email } });
      throw updateError;
    }

    // 作り直したトークンで招待メールを再送する（ユーザー種別ごとの文面・リンク先で送り分ける）
    // 引数の userType が無い場合は、招待に保存したユーザー種別を使う
    const resolvedUserType = userType || currentInvite.user_type;
    const inviteUrl = getInvitationUrl(resolvedUserType, newWeightToken);
    const mailResult = await sendInvitationEmail({
      to: email,
      userType: resolvedUserType,
      userName: currentInvite.user_name || '',
      inviteUrl: inviteUrl,
      expiresDays: INVITATION_EXPIRES_DAYS,
    });

    // 再送の結果を招待に記録する（成功時はエラーを消す）
    await supabase
      .from('com_t_invitation')
      .update({
        mail_sent_at: mailResult.success ? new Date().toISOString() : currentInvite.mail_sent_at,
        last_mail_error: mailResult.success ? null : mailResult.error || 'Resend Failed',
      })
      .eq('id', currentInvite.id);

    if (!mailResult.success) {
      return { success: false, message: t('users.errors.resendFailed') };
    }

    logger.info('user:resend_invite_success', `Invite resent to: ${email}`, {
      ...ctx,
      payload: { email },
    });

    revalidatePath('/users', 'layout');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('user:resend_invite_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { email },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ユーザー更新アクション
 */
export async function updateUser(id: string, payload: CreateUserPayload & { roles?: string[] }): Promise<ActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  const { email, user_name, client_id, user_type, roles = [] } = payload;

  try {
    const supabase = await createAdminClient();

    // 1. ユーザロール (com_t_user_role) の更新
    const { error: roleDeleteError } = await supabase.from('com_t_user_role').delete().eq('user_id', id);

    if (roleDeleteError) {
      logger.error('user:update_user_role_delete_failed', roleDeleteError.message, {
        ...ctx,
        err: roleDeleteError,
        payload: { id },
      });
      throw roleDeleteError;
    }

    if (roles.length > 0) {
      const { error: roleInsertError } = await supabase
        .from('com_t_user_role')
        .insert(roles.map((roleId) => ({ user_id: id, role_id: roleId })));

      if (roleInsertError) {
        logger.error('user:update_user_role_insert_failed', roleInsertError.message, {
          ...ctx,
          err: roleInsertError,
          payload: { id, roles },
        });
        throw roleInsertError;
      }
    }

    // 2. Auth情報の更新
    const { error: authError } = await supabase.auth.admin.updateUserById(id, {
      email: email,
      user_metadata: {
        user_name,
        user_type,
        client_id,
        roles,
      },
    });

    if (authError) {
      logger.error('user:update_user_auth_failed', authError.message, {
        ...ctx,
        err: authError,
        payload: { id, payload },
      });
      return { success: false, message: t('users.errors.authUpdateFailed') };
    }

    // 3. ユーザマスタ (public.com_m_user) の更新
    const { error: dbError } = await supabase
      .from('com_m_user')
      .update({
        user_name,
        user_type,
        client_id,
        update_date: new Date().toISOString(),
      })
      .eq('id', id);

    if (dbError) {
      logger.error('user:update_user_db_failed', dbError.message, { ...ctx, err: dbError, payload: { id, payload } });
      return { success: false, message: t('users.errors.userUpdateFailed') };
    }

    logger.info('user:update_user_success', `User updated: ${email}`, {
      ...ctx,
      payload: { userId: id, email, roles },
    });

    revalidatePath('/users', 'layout');
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('user:update_user_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { id, payload },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ユーザー一括登録アクション
 */
export async function bulkCreateUsers(users: BulkUser[], contract_id?: string): Promise<BulkImportResponse> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  const results: BulkImportResultDetail[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      // メール送信（Resend）の上限（2件/秒）を超えないよう、2人目以降は少し待つ
      if (results.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 600)); // 0.6秒待機
      }

      const result = await createUser({
        email: user.email,
        user_name: user.user_name,
        client_id: user.client_id,
        user_type: user.user_type,
        contract_id: contract_id === 'none' ? undefined : contract_id,
      });

      if (result.success && result.user_id) {
        successCount++;
        results.push({ id: result.user_id, email: user.email, status: 'success', message: result.message });
      } else {
        errorCount++;
        results.push({
          email: user.email,
          status: 'error',
          message: result.message || t('users.errors.createInvitationFailed'),
        });
      }
    } catch (err) {
      unstable_rethrow(err);
      logger.error('user:bulk_create_users_loop_unexpected', getErrorMessage(err), {
        ...ctx,
        err,
        payload: { email: user.email },
      });
      errorCount++;
      results.push({ email: user.email, status: 'error', message: t('common.errors.unexpected') });
    }
  }

  logger.info('user:bulk_create_users_success', `Bulk user import completed`, {
    ...ctx,
    payload: { total: users.length, successCount, errorCount },
  });

  revalidatePath('/users', 'layout');
  return { success: true, total: users.length, successCount, errorCount, details: results };
}

/**
 * ロールマスタの一覧取得
 */
export async function getRoles(): Promise<RoleDefinition[]> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_role')
      .select('role_id, role_name, target_user_type, seq_no')
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error('user:get_roles_failed', error.message, { ...ctx, err: error });
      return [];
    }

    return data as RoleDefinition[];
  } catch (error) {
    unstable_rethrow(error);
    logger.error('user:get_roles_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
    });
    return [];
  }
}
