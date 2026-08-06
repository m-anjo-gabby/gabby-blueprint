'use server';

import { createServerClient } from '../supabase/server';
import { createAdminClient } from '../supabase/admin';
import { User } from '@supabase/supabase-js';
import { UserBase, USER_TYPES } from '@gabby/types/user';
import { createLogger, getLogContext } from '../logger';
import { sendPasswordResetEmail } from '../mail/actions/sendPasswordReset';

// 💡 共通認証モジュールとしてのロガーを生成
const logger = createLogger('common');

/**
 * 認証レスポンスの共通型
 */
export type AuthResponse = {
  error?: string;
  success?: boolean;
  user?: User;
};

/**
 * 🔒 パスワードの強度を検証する共通関数
 */
function validatePasswordStrength(password: string): string | null {
  // 最小文字数を8文字以上に強化
  if (!password || password.length < 8) {
    return 'パスワードは8文字以上で入力してください。';
  }

  // 英字と数字の混在を必須化
  const hasAlpha = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasAlpha || !hasNumber) {
    return 'パスワードには英字と数字を両方含めてください。';
  }

  return null;
}

/**
 * 🔒 Supabaseからのエラーメッセージをユーザー向けの日本語に翻訳する共通関数
 */
function translateAuthError(message: string): string {
  const lowerMsg = message.toLowerCase();
  
  // 同一パスワードの再利用制限
  if (lowerMsg.includes('different from the old')) {
    return '新しいパスワードは現在と同じものは使用できません。';
  }
  
  // 1. 漏洩検知（HIBP: Have I Been Pwned 等）
  if (lowerMsg.includes('leaked') || lowerMsg.includes('pwned') || lowerMsg.includes('compromised')) {
    return 'このパスワードは過去にデータ漏洩の被害に遭った可能性があるため使用できません。他のパスワードを指定してください。';
  }

  // 2. 脆弱性・推測のしやすさ（Weak / Common / Guessable）
  if (
    lowerMsg.includes('common') || 
    lowerMsg.includes('weak') || 
    lowerMsg.includes('easy to guess')
  ) {
    return 'このパスワードは単純すぎるか推測されやすいため使用できません。より複雑なパスワードを設定してください。';
  }

  // セッション欠落（本番環境でのCookie不整合や期限切れなど）
  if (lowerMsg.includes('session missing')) {
    return '認証セッションが無効、または期限が切れています。一度ログアウトして再度ログインしてからお試しください。';
  }
  
  // 想定外のエラー時は、原因究明のために生のメッセージを付与して返却
  return `パスワードの更新に失敗しました。(${message})`;
}

/**
 * 1. ログイン（サインイン）処理
 * @param formData - email, password を含むフォームデータ
 * @param options.checkLicense - ライセンス検証を強制する場合に true
 */
export async function signInCore(
  formData: FormData, 
  options: { checkLicense?: boolean } = { checkLicense: false }
): Promise<AuthResponse> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください。' };
  }

  // 役割ごとに2つのクライアントを使い分ける
  const supabase = await createServerClient(); // ブラウザ・セッション管理（クッキー操作用）
  const supabaseAdmin = createAdminClient();  // ロック制御用（SQLでanon権限を剥奪したRPCを叩く用）

  // -------------------------------------------------------------
  // 🔒 1. ログイン試行前のロックアウトチェック
  // -------------------------------------------------------------
  // セキュアなRPC（get_user_lock_status_by_email）経由で、
  // auth.usersのemailを元に com_m_user のロック状態を取得
  // SQL側でanon権限を剥奪したため、ここだけ supabaseAdmin を使用してセキュアに実行します
  const { data: rpcData, error: masterError } = await supabaseAdmin
    .rpc('get_user_lock_status_by_email', { p_email: email })
    .maybeSingle();

  // 取得した rpcData を安全な型としてアサーション
  const userMaster = rpcData as {
    id: string;
    user_type: string;
    login_failed_count: number;
    locked_until: string | null;
  } | null;

  if (masterError) {
    // 💡 console.error から共通ロガーへ統合
    logger.error('auth:master_fetch_failed', masterError.message, { payload: { email } });
  }

  // ロック日時が設定されており、それが現在時刻より未来であればログインを水際で拒否
  if (userMaster && userMaster.locked_until && new Date(userMaster.locked_until) > new Date()) {
    logger.warn('auth:login_blocked_lockedout', `Locked user attempted login: ${email}`, {
      userId: userMaster.id,
      payload: { email, lockedUntil: userMaster.locked_until }
    });
    return { error: 'アカウントが一時的にロックされています。しばらく時間をおいてお試しください。' };
  }

  // -------------------------------------------------------------
  // 2. Supabase Authでサインイン試行
  // -------------------------------------------------------------
  const { data, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // -------------------------------------------------------------
  // 🔒 3. ログイン失敗時のハンドル（カウントアップ & ロック適用）
  // -------------------------------------------------------------
  if (authError || !data.user) {
    // 💡 エラーログをロガー経由で出力。機密情報（パスワード）を避けてエラーメッセージのみ追跡
    logger.warn('auth:supabase_signin_failed', authError?.message || 'Invalid credentials', {
      payload: { email }
    });

    // RPC経由でユーザーが特定できている場合のみ、失敗カウントの更新を行う
    if (userMaster) {
      // 管理者('0')は3回、それ以外（生徒等）は10回でロック
      const maxAttempts = userMaster.user_type === USER_TYPES.ADMIN ? 3 : 10;
      
      // RLSを回避するため、SQL側のセキュアな関数(RPC)を呼び出してカウントアップさせる
      // カウントアップ処理もSQL側で service_role 専用にしたため、supabaseAdmin を使用して安全に実行します
      const { error: updateError } = await supabaseAdmin.rpc('increment_login_failed_count', {
        p_user_id: userMaster.id,
        p_max_attempts: maxAttempts
      });

      if (updateError) {
        logger.error('auth:increment_counter_failed', updateError.message, {
          userId: userMaster.id,
          payload: { email }
        });
      }

      // 次の回数が上限に達するか判定（画面表示用のメッセージ制御）
      const nextFailedCount = (userMaster.login_failed_count || 0) + 1;
      if (nextFailedCount >= maxAttempts) {
        logger.warn('auth:account_lockedout', `Account has been locked out for 30 minutes: ${email}`, {
          userId: userMaster.id,
          payload: { email, failedCount: nextFailedCount }
        });
        return { error: 'パスワードを連続して間違えたため、アカウントが30分間ロックされました。' };
      }
    }

    return { error: '認証情報が正しくありません。' };
  }

  // -------------------------------------------------------------
  // 🔒 4. ログイン成功時のハンドル（失敗カウント・ロックのリセット）
  // -------------------------------------------------------------
  // 過去に失敗履歴がある、またはロック日時が残っている場合はクリーンにクリアする
  // 💡 login_failed_count / locked_until は権限昇格防止のため authenticated ロールの
  // 列単位UPDATE権限から除外している（com_m_user.sql参照）。セッションクライアント(supabase)
  // では更新できないため、ここは supabaseAdmin(service_role) 経由で実行する。
  if (userMaster && (userMaster.login_failed_count > 0 || userMaster.locked_until)) {
    const { error: resetError } = await supabaseAdmin
      .from('com_m_user')
      .update({
        login_failed_count: 0,
        locked_until: null,
        update_date: new Date().toISOString()
      } as Partial<UserBase>)
      .eq('id', userMaster.id);

    if (resetError) {
      logger.error('auth:reset_counter_failed', resetError.message, {
        userId: data.user.id,
        email: data.user.email
      });
    }
  }

  // -------------------------------------------------------------
  // 5. ライセンスチェックが必要な場合のガード
  // -------------------------------------------------------------
  if (options.checkLicense) {
    const isLicensed = await checkLicense(data.user.id);
    if (!isLicensed) {
      logger.warn('auth:license_guard_triggered', `Licensed access denied for user: ${data.user.email}`, {
        userId: data.user.id,
        email: data.user.email
      });
      // ライセンスがない場合は即座にサインアウトさせる
      await supabase.auth.signOut();
      return { error: '有効なライセンスが見つかりません。管理者にお問い合わせください。' };
    }
  }

  return { user: data.user, success: true };
}

/**
 * 2. ログアウト処理
 */
export async function signOutCore(): Promise<AuthResponse> {
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    logger.error('auth:supabase_signout_failed', error.message);
    return { error: 'ログアウト中にエラーが発生しました。' };
  }

  return { success: true };
}

/**
 * 3. パスワードリセットメール送信
 * @param formData - email を含むフォームデータ
 */
export async function forgotPasswordCore(formData: FormData): Promise<AuthResponse> {
  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'メールアドレスを入力してください。' };
  }

  try {
    // 💡 改善: メール自体は独自で送るため、Supabase側からは「送信」ではなく「認証リンク（トークン）」のみを行政権限で発行させる
    const supabaseAdmin = await createAdminClient();
    
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        // 💡 既存のリダイレクト設定をそのまま引き継ぐ（認証後のパスワード入力画面パス）
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/update-password`,
      }
    });

    if (linkError) {
      logger.error('auth:reset_email_link_generation_failed', linkError.message, { payload: { email } });
      return { error: 'メールの送信に失敗しました。時間をおいて再度お試しください。' };
    }

    if (!data || !data.properties?.action_link) {
      logger.error('auth:reset_email_link_empty', '生成されたアクションリンクが空です', { payload: { email } });
      return { error: 'メールの送信に失敗しました。時間をおいて再度お試しください。' };
    }

    // 💡 修正: Supabase内部の verify エンドポイントを経由すると、非PKCE時はセッションが
    // フラグメント (#) で返りサーバーサイドの callback で取得できなくなるため、
    // 直接アプリのコールバック URL を生成してトークン (hashed_token) を渡します。
    const tokenHash = data.properties.hashed_token;
    const appResetUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?token_hash=${tokenHash}&type=recovery&next=/update-password`;

    // 独自にデザインしたリッチHTMLメールを Resend から安全に送信！
    // 考慮点: 有効期限テキストは、SupabaseのAuth設定（Inactivity timeout / Gotrue設定）のデフォルトに合わせて調整（通常は30分や60分）
    const mailResult = await sendPasswordResetEmail({
      to: email,
      resetUrl: appResetUrl,
      expiresText: '30分間' 
    });

    if (!mailResult.success) {
      logger.error('auth:reset_email_dispatch_failed', mailResult.error || 'Unknown error', { payload: { email } });
      return { error: 'メールの送信に失敗しました。時間をおいて再度お試しください。' };
    }

    return { success: true };

  } catch (err) {
    logger.error('auth:forgot_password_unexpected', err instanceof Error ? err.message : 'Unknown error', { payload: { email } });
    return { error: '予期せぬエラーが発生しました。時間をおいて再度お試しください。' };
  }
}

/**
 * 4. パスワード更新（リセットリンクからの遷移時）
 * @param formData - password を含むフォームデータ
 */
export async function resetPasswordCore(formData: FormData): Promise<AuthResponse> {
  const password = formData.get('password') as string;

  // 💡 共通の強度バリデーションを適用（8文字以上、英数混在）
  const validationError = validatePasswordStrength(password);
  if (validationError) {
    return { error: validationError };
  }

  const supabase = await createServerClient();
  
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    logger.error('auth:reset_password_submission_failed', error.message);
    // 💡 共通のエラー翻訳ロジックを通すことで、古いパスワード制限や漏洩検知に対応
    return { error: translateAuthError(error.message) };
  }

  return { success: true };
}

/**
 * 5. パスワード更新（ログイン済みユーザーによる変更）
 * @param formData - currentPassword, newPassword を含むフォームデータ
 */
export async function updatePasswordCore(formData: FormData): Promise<AuthResponse> {
  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;

  // 💡 共通の強度バリデーションを適用（8文字以上、英数混在）
  const validationError = validatePasswordStrength(newPassword);
  if (validationError) {
    return { error: validationError };
  }

  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: 'セッションがタイムアウトしました。再度ログインしてください。' };

  // 💡 ログイン済みなのでログコンテキスト（IP、UAなど）を取得して紐付け
  const ctx = await getLogContext();

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    logger.warn('auth:update_password_reauth_failed', 'Re-authentication failed during password change', {
      userId: user.id,
      email: user.email,
      ...ctx
    });
    return { error: '現在のパスワードが正しくありません。' };
  }

  const { error: updateError } = await supabase.auth.updateUser({ 
    password: newPassword 
  });

  if (updateError) {
    logger.error('auth:update_password_execution_failed', updateError.message, {
      userId: user.id,
      email: user.email,
      ...ctx
    });
    // 💡 共通のエラー翻訳ロジックを通すことで、古いパスワード制限や漏洩検知に対応
    return { error: translateAuthError(updateError.message) };
  }

  return { success: true };
}

/**
 * ユーザーの有効なライセンスを確認する
 * @param userId 
 */
export async function checkLicense(userId: string): Promise<boolean> {
  const supabase = await createServerClient();
  
  const { data, error } = await supabase
    .from('com_t_user_license')
    .select('license_id')
    .eq('user_id', userId)
    .eq('status', 1)
    .gte('end_date', 'now()')
    .limit(1) // 現在有効なものと未来のものが複数ある場合を考慮し、1件でもあればOKとする
    .maybeSingle();

  if (error) {
    logger.error('auth:license_check_db_error', error.message, { userId });
  }

  return !!data && !error;
}

// =============================================================
// 💡 以下、独自招待テーブル（com_t_invitation）用の新規アクション
// =============================================================

interface AcceptInvitationPayload {
  token: string;
  password?: string;
}

interface AcceptInvitationResponse {
  success: boolean;
  message: string | null;
  errorType: 'invalid_token' | 'expired_token' | 'auth_failed' | 'validation_error' | 'unexpected_error' | null;
}

/**
 * 6. 招待用ワンタイムトークンの事前検証（クライアント初期ロード用）
 * @param token - 招待状の一意な暗号トークン
 */
export async function verifyInvitationToken(token: string) {
  try {
    const supabase = createAdminClient();

    const { data: invite, error } = await supabase
      .from('com_t_invitation')
      .select('id, email, user_name, expires_at, user_type, client_id, contract_id, roles')
      .eq('token', token)
      .is('accepted_at', null)
      .maybeSingle();

    if (error || !invite) {
      return { valid: false, errorType: 'invalid_token', message: 'この招待リンクは無効か、すでに本登録が完了しています。' };
    }

    if (new Date(invite.expires_at) < new Date()) {
      return { valid: false, errorType: 'expired_token', message: '招待リンクの有効期限が切れています。管理者に再送を依頼してください。' };
    }

    return { valid: true, data: invite };
  } catch (err) {
    return { valid: false, errorType: 'unexpected_error', message: 'トークンの検証中にエラーが発生しました。' };
  }
}

/**
 * 7. 招待リンクからのユーザー本登録（パスワード設定・マスタ同期）処理
 * @param payload - token とユーザーによって入力された password
 */
export async function acceptInvitationAction(payload: AcceptInvitationPayload): Promise<AcceptInvitationResponse> {
  const ctx = await getLogContext();
  const { token, password } = payload;

  try {
    if (!password) {
      return { success: false, errorType: 'validation_error', message: 'パスワードを入力してください。' };
    }

    // 💡 改善: ファイル上部に定義されている共通の強度バリデーションを完全流用
    const validationError = validatePasswordStrength(password);
    if (validationError) {
      return { success: false, errorType: 'validation_error', message: validationError };
    }

    // 1. トークンの厳密な有効性検証
    const verification = await verifyInvitationToken(token);
    if (!verification.valid || !verification.data) {
      return { 
        success: false, 
        errorType: verification.errorType as any, 
        message: verification.message ?? '不正なリクエストです。' 
      };
    }

    const inviteRecord = verification.data;
    const supabase = createAdminClient();

    // 2. Supabase Auth側へ正式なログインユーザーとしてアカウントを作成
    // ※ 既存のDBトリガーにより、public.com_m_user への基本レコードの自動同期が行われます
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: inviteRecord.email,
      password: password,
      email_confirm: true, // パスワードをその場で設定しているため、確認済みフラグを立てる
      user_metadata: {
        user_name: inviteRecord.user_name,
        user_type: inviteRecord.user_type,
        client_id: inviteRecord.client_id, // 🚀 修正: ここで client_id をメタデータに渡すことで、トリガー側が初期テナントにフォールバックするのを防ぎます
        roles: inviteRecord.roles // 招待時のロールをメタデータにも同期
      }
    });

    if (authError || !authData.user) {
      logger.error('auth:accept_invite_signup_failed', authError?.message || 'User object null', { ...ctx, email: inviteRecord.email });
      return { success: false, errorType: 'auth_failed', message: `アカウントの作成に失敗しました: ${authError?.message}` };
    }

    const newUserId = authData.user.id;

    // 3. トリガーで自動作成されたマスタレコード(com_m_user)を確定情報でアップデート
    const { error: dbUserError } = await supabase
      .from('com_m_user')
      .update({
        client_id: inviteRecord.client_id, // 🚀 修正: トリガーだけでなく、念のためここでも確定した client_id で上書き同期を保証します
        user_name: inviteRecord.user_name,
        user_type: inviteRecord.user_type,
        update_date: new Date().toISOString()
      })
      .eq('id', newUserId);

    if (dbUserError) {
      logger.error('auth:accept_invite_m_user_sync_failed', dbUserError.message, { ...ctx, userId: newUserId });
      throw dbUserError;
    }

    // 4. 招待時に紐付けられていたロールを取得して一括挿入
    const targetRoles = (inviteRecord.roles as string[]) || [];
    if (targetRoles.length > 0) {
      const { error: roleError } = await supabase
        .from('com_t_user_role')
        .insert(targetRoles.map((roleId: string) => ({
          user_id: newUserId,
          role_id: roleId
        })));

      if (roleError) {
        logger.error('auth:accept_invite_roles_insert_failed', roleError.message, { ...ctx, userId: newUserId, roles: targetRoles });
      }
    }

    // 5. 招待時に指定されたライセンスがあれば有効化
    if (inviteRecord.contract_id) {
      // 契約期間を取得
      const { data: contract } = await supabase
        .from('com_m_contract')
        .select('start_date, end_date')
        .eq('contract_id', inviteRecord.contract_id)
        .single();

      if (contract) {
        const { error: licenseError } = await supabase
          .from('com_t_user_license')
          .insert({
            user_id: newUserId,
            contract_id: inviteRecord.contract_id,
            start_date: contract.start_date,
            end_date: contract.end_date,
            status: 1
          });
        if (licenseError) {
          logger.error('auth:accept_invite_license_insert_failed', licenseError.message, { ...ctx, userId: newUserId });
        }
      }
    }

    // 6. 最後に招待状レコードをクローズ（承認日時の記録）
    const { error: closeError } = await supabase
      .from('com_t_invitation')
      .update({
        accepted_at: new Date().toISOString(),
        update_date: new Date().toISOString()
      })
      .eq('id', inviteRecord.id);

    if (closeError) {
      logger.error('auth:accept_invite_close_record_failed', closeError.message, { ...ctx, inviteId: inviteRecord.id });
    }

    logger.info('auth:accept_invite_all_success', `User registration fully completed: ${inviteRecord.email}`, {
      ...ctx,
      userId: newUserId
    });

    return { success: true, message: '本登録が正常に完了しました。', errorType: null };

  } catch (err) {
    logger.error('auth:accept_invite_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorType: 'unexpected_error', message: '予期せぬシステムエラーが発生しました。' };
  }
}