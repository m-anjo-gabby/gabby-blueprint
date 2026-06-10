// packages/lib/auth/actions.ts
import { createServerClient } from '../supabase/server';
import { User } from '@supabase/supabase-js';
import { UserBase, USER_TYPES } from '@gabby/types/user';
import { createLogger, getLogContext } from '../logger';

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
  
  // Proプラン機能「Prevent use of leaked passwords」の検知ハンドル
  if (lowerMsg.includes('leaked') || lowerMsg.includes('pwned') || lowerMsg.includes('compromised')) {
    return 'このパスワードは過去にデータ漏洩の被害に遭った可能性があるため使用できません。他のパスワードを指定してください。';
  }
  
  return 'パスワードの更新に失敗しました。';
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

  // サーバー用クライアントの生成 (Cookie管理を含む)
  const supabase = await createServerClient();

  // -------------------------------------------------------------
  // 🔒 1. ログイン試行前のロックアウトチェック
  // -------------------------------------------------------------
  // セキュアなRPC（get_user_lock_status_by_email）経由で、
  // auth.usersのemailを元に com_m_user のロック状態を取得
  const { data: rpcData, error: masterError } = await supabase
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
      const { error: updateError } = await supabase.rpc('increment_login_failed_count', {
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
  if (userMaster && (userMaster.login_failed_count > 0 || userMaster.locked_until)) {
    const { error: resetError } = await supabase
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

  const supabase = await createServerClient();
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/update-password`,
  });

  if (error) {
    logger.error('auth:reset_email_dispatch_failed', error.message, { payload: { email } });
    return { error: 'メールの送信に失敗しました。時間をおいて再度お試しください。' };
  }

  return { success: true };
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
    .lte('start_date', 'now()')
    .gte('end_date', 'now()')
    .maybeSingle();

  if (error) {
    logger.error('auth:license_check_db_error', error.message, { userId });
  }

  return !!data && !error;
}