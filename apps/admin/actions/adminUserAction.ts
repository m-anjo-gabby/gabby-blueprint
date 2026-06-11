'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { 
  UserRecord, 
  CreateUserPayload, 
  CreateUserResponse, 
  BulkUser, 
  BulkImportResponse, 
  BulkImportResultDetail, 
  RoleDefinition,
  USER_TYPES
} from "@gabby/types/user";
import { formatToJstDate } from "@gabby/lib/date/date";
import { revalidatePath } from "next/cache";
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { sendInvitationEmail } from "@gabby/lib/mail/actions/sendInvitation"; // 独自メール配信用ユーティリティ
import { randomBytes } from "crypto"; // 暗号トークン生成用

const logger = createLogger('admin');

/**
 * 💡 改善: ユーザ種別に応じたリダイレクト先（招待画面のベースURL）を解決する共通ヘルパー
 * 今後、コーチ用サイト(COACH)などが追加された場合も、この switch 文に定義を追加するだけで安全に拡張可能です。
 */
function getRedirectBase(userType?: string): string {
  switch (userType) {
    case USER_TYPES.ADMIN:
      return process.env.NEXT_PUBLIC_SITE_URL || '';
    // 将来的な拡張例:
    // case USER_TYPES.COACH:
    //   return process.env.NEXT_PUBLIC_COACH_URL || '';
    default:
      return process.env.NEXT_PUBLIC_STUDENT_URL || '';
  }
}

/**
 * トークン付きの最終的な招待リダイレクトURLを生成する共通ヘルパー
 */
function getInvitationUrl(userType: string | undefined, token: string): string {
  const base = getRedirectBase(userType);
  return `${base}/auth/invite?token=${token}`;
}

/**
 * 招待リンクの有効期限（送信から7日間）を一元的に生成するヘルパー
 */
function getInvitationExpiry(days: number = 7): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

/**
 * ユーザ情報の一覧取得（ページネーション・検索対応）
 */
export async function getUsers(
  page: number = 1,
  pageSize: number = 10,
  searchQuery?: string,
  clientId?: string
): Promise<{ users: UserRecord[]; totalCount: number }> {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .schema('private')
      .from('vw_user_list')
      .select('*', { count: 'exact' });

    if (searchQuery) {
      query = query.or(`user_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,client_name.ilike.%${searchQuery}%`);
    };

    if (clientId) {
      query = query.eq('client_id', clientId);
    };

    const { data, error, count } = await query
      .order('insert_date', { ascending: false }) // 💡 改善: 統合されたビューの特性に合わせ、最新の招待・登録者が一番上に来るように降順に最適化
      .range(from, to);

    if (error) {
      logger.error('user:get_users_failed', error.message, { ...ctx, payload: { page, pageSize, searchQuery, clientId } });
      throw error;
    }

    const formattedUsers = (data || []).map((user: any) => ({
      ...user,
      license_start_date: user.license_start_date ? formatToJstDate(user.license_start_date) : null,
      license_end_date: user.license_end_date ? formatToJstDate(user.license_end_date) : null,
    }));

    return {
      users: formattedUsers as UserRecord[],
      totalCount: count || 0,
    };
  } catch (error) {
    logger.error('user:get_users_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { page, pageSize, searchQuery, clientId } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * ユーザー登録アクション
 */
export async function createUser(payload: CreateUserPayload & { roles?: string[], contract_id?: string }): Promise<CreateUserResponse> {
  const ctx = await getLogContext();
  const { email, user_name, client_id, user_type, roles = [], contract_id } = payload;
  
  try {
    const supabase = await createAdminClient();

    // ユーザ種別に応じてリダイレクト先（招待画面のベースURL）を切り替え -> 💡 共通ヘルパーを利用
    // const redirectBase = user_type === USER_TYPES.ADMIN ? process.env.NEXT_PUBLIC_SITE_URL : process.env.NEXT_PUBLIC_STUDENT_URL;

    // 💡 改善: 本登録用マスタ(com_m_user)にすでに存在していないか先に確認します
    const { data: existingUser } = await supabase
      .from('com_m_user')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return { success: false, user_id: null, errorType: 'email_exists', message: "登録済みメールです。" };
    }

    // 💡 改善: 有効期限を 7日間に設定（従来の24時間制限を突破） -> 💡 共通ヘルパーを利用
    const expiresAt = getInvitationExpiry(7);

    // 💡 改善: 暗号論的に安全なランダムトークンを生成
    const invitationToken = randomBytes(32).toString('hex');

    // 1. 招待メールを送信し、アカウントを作成 -> 【変更】独自招待テーブルへのレコード挿入にリプレイス
    const { data: inviteData, error } = await supabase
      .from('com_t_invitation')
      .insert({
        email,
        user_name,
        user_type,
        client_id: client_id || null,
        contract_id: contract_id || null,
        roles,
        token: invitationToken,
        expires_at: expiresAt.toISOString(),
        invited_by: ctx.userId || null
      })
      .select('id, token')
      .single();

    if (error) {
      if (error.code === '23505') { // Postgresの一意制約違反（既に同じメールアドレスが招待中）
        return { success: false, user_id: null, errorType: 'email_exists', message: "登録済みメールです。" };
      }
      logger.error('user:create_user_invite_failed', error.message, { ...ctx, payload });
      return { success: false, user_id: null, errorType: 'unexpected_error', message: error.message };
    }

    if (!inviteData) {
      return { success: false, user_id: null, errorType: 'unexpected_error', message: "データの作成に失敗しました。" };
    }

    const userId = inviteData.id; // 💡 既存機能（一括インポートなど）との互換性のため、発行された招待ID(UUID)を仮のuserIdとして引き継ぐ

    // 2. DB側のロール紐付け -> 【変更】本登録時(メールリンク承認時)に移行するため、この時点での com_t_user_role への直接挿入はスキップ（上記で配列として保存済み）
    /*
    if (roles.length > 0) {
      const { error: roleError } = await supabase
        .from('com_t_user_role')
        .insert(roles.map(roleId => ({ user_id: userId, role_id: roleId })));
      
      if (roleError) {
        logger.error('user:create_user_role_insert_failed', roleError.message, { ...ctx, payload: { userId, roles } });
      }
    }
    */

    // 💡 改善: 独自メール送信処理を実行 (Resend) -> 💡 共通ヘルパーを利用してURLを解決
    const inviteUrl = getInvitationUrl(user_type, inviteData.token);
    const mailResult = await sendInvitationEmail({
      to: email,
      userName: user_name || '会員',
      inviteUrl: inviteUrl
    });

    // 💡 改善: メール送信結果をDBに記録
    await supabase
      .from('com_t_invitation')
      .update({
        mail_sent_at: mailResult.success ? new Date().toISOString() : null,
        last_mail_error: mailResult.success ? null : (mailResult.error || "Unknown Error")
      })
      .eq('id', userId);

    if (!mailResult.success) {
      logger.error('user:create_user_mail_dispatch_failed', mailResult.error || 'Unknown error', { ...ctx, email });
      // メール送信に失敗しても、レコードは作成されているため管理画面一覧からいつでも「再送」が可能です。
    }

    logger.info('user:create_user_success', `User invited: ${email}`, { 
      ...ctx,
      payload: { userId, email, clientId: client_id } 
    });

    revalidatePath('/users');
    return { success: true, user_id: userId, errorType: null, message: mailResult.success ? null : (mailResult.error || "招待メールの送信に失敗しました") };

  } catch (err) {
    logger.error("user:create_user_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload });
    return { success: false, user_id: null, errorType: 'unexpected_error', message: "予期せぬエラーが発生しました" };
  }
}

/**
 * ユーザー再招待招待アクション
 */
export async function resendInvite(email: string, userType?: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // ユーザ種別に応じてリダイレクト先（招待画面のベースURL）を切り替え -> 💡 共通ヘルパーへ移譲
    // const redirectBase = userType === USER_TYPES.ADMIN ? process.env.NEXT_PUBLIC_SITE_URL : process.env.NEXT_PUBLIC_STUDENT_URL;

    // 💡 改善: 既存の承認待ち(accepted_at IS NULL)の招待状を取得します
    const { data: currentInvite, error: fetchError } = await supabase
      .from('com_t_invitation')
      .select('*')
      .eq('email', email)
      .is('accepted_at', null)
      .maybeSingle();

    if (fetchError || !currentInvite) {
      logger.warn('user:resend_invite_not_found', `No active invitation found for: ${email}`, { ...ctx });
      return { success: false, message: '対象の招待データが見つからないか、既に登録が完了しています。' };
    }

    // 💡 改善: 安全性の向上として有効期限を +7日 にリフレッシュし、新しいワンタイムトークンを再生成します -> 💡 共通ヘルパーを利用
    const newExpiresAt = getInvitationExpiry(7);
    const newWeightToken = randomBytes(32).toString('hex');

    const { error: updateError } = await supabase
      .from('com_t_invitation')
      .update({
        token: newWeightToken,
        expires_at: newExpiresAt.toISOString(),
        update_date: new Date().toISOString()
      })
      .eq('id', currentInvite.id);

    if (updateError) {
      logger.error('user:resend_invite_failed', updateError.message, { ...ctx, payload: { email } });
      throw updateError;
    }

    // 💡 改善: 再生成したトークンで Resend 経由でメールを再送 -> 💡 共通ヘルパーを利用してURLを解決
    // 💡 考慮点: 引数の userType が省略されて渡された場合でも、DBから取得した一貫性のある currentInvite.user_type をフォールバックとして優先適用
    const inviteUrl = getInvitationUrl(userType || currentInvite.user_type, newWeightToken);
    const mailResult = await sendInvitationEmail({
      to: email,
      userName: currentInvite.user_name || '会員',
      inviteUrl: inviteUrl
    });

    // 💡 改善: 再送結果をDBに記録（成功時はエラーをクリア）
    await supabase
      .from('com_t_invitation')
      .update({
        mail_sent_at: mailResult.success ? new Date().toISOString() : currentInvite.mail_sent_at,
        last_mail_error: mailResult.success ? null : (mailResult.error || "Resend Failed")
      })
      .eq('id', currentInvite.id);

    if (!mailResult.success) {
      return { success: false, message: 'メールの再送に失敗しました。' };
    }

    logger.info('user:resend_invite_success', `Invite resent to: ${email}`, { 
      ...ctx,
      payload: { email } 
    });

    revalidatePath('/users');
    return { success: true };
  } catch (error) {
    logger.error('user:resend_invite_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { email } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * ユーザー更新アクション
 */
export async function updateUser(
  id: string,
  payload: CreateUserPayload & { roles?: string[] }
) {
  const ctx = await getLogContext();
  const { email, user_name, client_id, user_type, roles = [] } = payload;
  
  try {
    const supabase = await createAdminClient();

    // 1. ユーザロール (com_t_user_role) の更新
    const { error: roleDeleteError } = await supabase
      .from('com_t_user_role')
      .delete()
      .eq('user_id', id);

    if (roleDeleteError) {
      logger.error('user:update_user_role_delete_failed', roleDeleteError.message, { ...ctx, payload: { id } });
      throw roleDeleteError;
    }

    if (roles.length > 0) {
      const { error: roleInsertError } = await supabase
        .from('com_t_user_role')
        .insert(roles.map(roleId => ({ user_id: id, role_id: roleId })));
      
      if (roleInsertError) {
        logger.error('user:update_user_role_insert_failed', roleInsertError.message, { ...ctx, payload: { id, roles } });
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
        roles
      }
    });

    if (authError) {
      logger.error('user:update_user_auth_failed', authError.message, { ...ctx, payload: { id, payload } });
      return { success: false, errorType: 'update_error', message: `Auth更新失敗: ${authError.message}` };
    }

    // 3. ユーザマスタ (public.com_m_user) の更新
    const { error: dbError } = await supabase
      .from('com_m_user')
      .update({
        user_name,
        user_type,
        client_id,
        update_date: new Date().toISOString()
      })
      .eq('id', id);

    if (dbError) {
      logger.error("user:update_user_db_failed", dbError.message, { ...ctx, payload: { id, payload } });
      return { success: false, errorType: 'update_error', message: `マスタ更新に失敗しました: ${dbError.message}` };
    }

    logger.info('user:update_user_success', `User updated: ${email}`, { 
      ...ctx,
      payload: { userId: id, email } 
    });

    revalidatePath('/users');
    return { success: true };

  } catch (err) {
    logger.error("user:update_user_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { id, payload } });
    return { success: false, errorType: 'unexpected_error', message: "予期せぬエラーが発生しました" };
  }
}

/**
 * ユーザー一括登録アクション
 */
export async function bulkCreateUsers(users: BulkUser[], contract_id?: string): Promise<BulkImportResponse> {
  const ctx = await getLogContext();
  const results: BulkImportResultDetail[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      // 💡 改善: メールAPI (Resend) のレートリミット(2req/s)を考慮し、2人目以降は少し待機する
      if (results.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 600)); // 0.6秒待機
      }

      const result = await createUser({
        email: user.email,
        user_name: user.user_name,
        client_id: user.client_id,
        user_type: user.user_type,
        contract_id: contract_id === 'none' ? undefined : contract_id
      });

      if (result.success && result.user_id) {
        successCount++;
        results.push({ id: result.user_id, email: user.email, status: 'success', message: result.message });
      } else {
        errorCount++;
        results.push({ email: user.email, status: 'error', message: result.message || "招待データの作成に失敗しました" });
      }
    } catch (err) {
      logger.error("user:bulk_create_users_loop_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { email: user.email } });
      errorCount++;
      results.push({ email: user.email, status: 'error', message: "予期せぬエラーが発生しました" });
    }
  }

  logger.info('user:bulk_create_users_success', `Bulk user import completed`, { 
    ...ctx,
    payload: { total: users.length, successCount, errorCount } 
  });

  revalidatePath('/users');
  return { success: true, total: users.length, successCount, errorCount, details: results };
}

/**
 * ロールマスタの一覧取得
 */
export async function getRoles(): Promise<RoleDefinition[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_role')
      .select('role_id, role_name, target_user_type, seq_no')
      .eq('delete_flg', '0')
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error("user:get_roles_failed", error.message, ctx);
      return [];
    }

    return data as RoleDefinition[];
  } catch (error) {
    logger.error("user:get_roles_unexpected", error instanceof Error ? error.message : 'Unknown error', ctx);
    return [];
  }
}