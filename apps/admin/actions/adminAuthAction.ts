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

const logger = createLogger('admin');

/**
 * 管理者ログイン
 * 認証後、user_typeを確認します
 */
export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;

  const { user, error } = await signInCore(formData);
  
  // 認証エラー時は呼び出し元のフォームにメッセージを返す
  if (error || !user) {
    logger.error('auth:admin_login_failed', error || 'Unknown error', {
      payload: { email }
    });
    return { error };
  }

  // app_metadata から user_type を取得 ('0': 管理者, '1': 生徒)
  const userType = user.app_metadata?.user_type as string | undefined;
  
  // 生徒が管理者ポータルにログインしようとした場合
  if (userType !== '0') {
    logger.warn('auth:invalid_portal_access', `Student user (${user.email}) attempted to login to admin portal.`, {
      userId: user.id,
      payload: { userType }
    });
    await signOutCore();
    return { error: '権限がありません。生徒用サイトからログインしてください。' };
  }
  
  logger.info('auth:admin_login_success', `Admin logged in: ${user.email}`, { 
    userId: user.id,
    payload: { roles: user.app_metadata?.roles }
  });
  redirect('/dashboard');
}

/**
 * 管理者ログアウト
 */
export async function signOut() {
  logger.info('auth:admin_logout', 'Admin initiated logout');
  await signOutCore();
  // 管理用ログイン画面へ戻す
  redirect('/login');
}

/**
 * パスワード再設定メール送信
 */
export async function forgotPassword(formData: FormData) {
  const email = formData.get('email') as string;
  const result = await forgotPasswordCore(formData);

  if (result.error) {
    logger.error('auth:admin_forgot_password_failed', result.error, { payload: { email } });
  } else {
    logger.info('auth:admin_forgot_password_sent', `Reset email sent to: ${email}`);
  }

  return result;
}

/**
 * パスワード更新（メールリンクからの復帰時）
 */
export async function resetPassword(formData: FormData) {
  const { success, error } = await resetPasswordCore(formData);
  
  if (success) {
    logger.info('auth:admin_reset_password_success', 'Admin successfully reset password via email link');
    redirect('/login?message=password-updated');
  }

  logger.error('auth:admin_reset_password_failed', error || 'Failed to reset password');
  return { error };
}

/**
 * プロフィール画面等からのパスワード変更
 */
export async function updatePassword(formData: FormData) {
  const result = await updatePasswordCore(formData);

  if (result.error) {
    logger.error('auth:admin_update_password_failed', result.error);
  } else {
    logger.info('auth:admin_update_password_success', 'Admin updated password from settings');
  }

  return result;
}