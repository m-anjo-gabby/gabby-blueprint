'use server';

import { 
  signInCore, 
  signOutCore, 
  forgotPasswordCore, 
  resetPasswordCore, 
  updatePasswordCore 
} from '@gabby/lib/auth/actions';
import { createLogger } from '@gabby/lib/logger/logger';
import { redirect } from 'next/navigation';

const logger = createLogger('student');

/**
 * 生徒ログイン
 * 誤って管理者がここからログインした場合は管理画面へ転送します
 */
export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;

  // ライセンスチェックを有効化して呼び出す
  const { user, error } = await signInCore(formData, { checkLicense: true });
  
  if (error || !user) {
    logger.error('auth:login_failed', error || 'Unknown error', {
      payload: { email } 
    });
    return { error };
  }

  const userType = user.app_metadata?.user_type as string | undefined;
  
  // 管理者がログインしようとした場合
  if (userType === '0') {
    logger.warn('auth:invalid_portal', 'Admin user tried to login to student portal', {
      userId: user.id,
      payload: { email: user.email }
    });
    // セッションをクリアするためにログアウト処理を実行
    await signOutCore();
    return { error: '管理者アカウントです。管理画面からログインしてください。' };
  }
  
  // 通常の生徒は自身のダッシュボードへ
  logger.info('auth:login_success', `User logged in: ${user.email}`, { 
    userId: user.id,
    payload: { isLicensed: user.app_metadata?.is_licensed }
  });
  redirect('/dashboard');
}

/**
 * 生徒ログアウト
 */
export async function signOut() {
  // ログアウト前にイベントを記録（セッションが切れる前に行う）
  logger.info('auth:logout', 'User initiated logout');
  
  await signOutCore();
  // 生徒用ログイン画面へ
  redirect('/login');
}

/**
 * パスワード再設定メール送信
 */
export async function forgotPassword(formData: FormData) {
  const email = formData.get('email') as string;
  const result = await forgotPasswordCore(formData);

  if (result.error) {
    logger.error('auth:forgot_password_failed', result.error, { payload: { email } });
  } else {
    logger.info('auth:forgot_password_sent', `Reset email sent to: ${email}`);
  }

  return result;
}

/**
 * パスワード更新（メールリンクからの復帰時）
 */
export async function resetPassword(formData: FormData) {
  const { success, error } = await resetPasswordCore(formData);

  if (success) {
    logger.info('auth:reset_password_success', 'User successfully reset password via email link');
    redirect('/login?message=password-updated');
  }

  logger.error('auth:reset_password_failed', error || 'Failed to reset password');
  return { error };
}

/**
 * 学習画面や設定画面からのパスワード変更
 */
export async function updatePassword(formData: FormData) {
  const result = await updatePasswordCore(formData);

  if (result.error) {
    logger.error('auth:update_password_failed', result.error);
  } else {
    logger.info('auth:update_password_success', 'User updated password from settings');
  }

  return result;
}