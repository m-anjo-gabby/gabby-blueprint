'use server';

import { 
  signInCore, 
  signOutCore, 
  forgotPasswordCore, 
  resetPasswordCore, 
  updatePasswordCore 
} from '@gabby/lib/auth/actions';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { revalidatePath } from 'next/cache';
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
    // ログイン失敗時はコンテキストが取れないため、メールアドレスのみ記録
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
      email: user.email,
      payload: { email: user.email, userType }
    });
    // セッションをクリアするためにログアウト処理を実行
    await signOutCore();
    return { error: '管理者アカウントです。管理画面からログインしてください。' };
  }
  
  // 通常の生徒は自身のダッシュボードへ
  logger.info('auth:login_success', `User logged in: ${user.email}`, { 
    userId: user.id,
    email: user.email,
    payload: { isLicensed: user.app_metadata?.is_licensed }
  });
  redirect('/dashboard');
}

/**
 * 生徒ログアウト
 */
export async function signOut() {
  const ctx = await getLogContext();
  // ログアウト前にイベントを記録（セッションが切れる前に行う）
  logger.info('auth:logout', 'User initiated logout', ctx);
  
  await signOutCore();

  // 全てのサーバーキャッシュを無効化
  revalidatePath('/', 'layout');

  // クライアント側でリダイレクトを処理するため、ここではredirectしない。
  // クライアント側で `window.location.href = '/login'` を実行し、
  // ブラウザのメモリを完全にクリアすることを推奨します。
}

/**
 * パスワード再設定メール送信
 */
export async function forgotPassword(formData: FormData) {
  const email = formData.get('email') as string;
  const result = await forgotPasswordCore(formData);

  if (result.error) {
    // 未ログイン状態のため、直接ペイロードを入れる
    logger.error('auth:forgot_password_failed', result.error, { payload: { email } });
  } else {
    logger.info('auth:forgot_password_sent', `Reset email sent to: ${email}`, { payload: { email } });
  }

  return result;
}

/**
 * パスワード更新（メールリンクからの復帰時）
 */
export async function resetPassword(formData: FormData) {
  const { success, error } = await resetPasswordCore(formData);

  if (success) {
    // パスワードリセット成功時は、通常その後の自動ログイン状態になるため ctx 取得を試みる
    const ctx = await getLogContext();
    logger.info('auth:reset_password_success', 'User successfully reset password via email link', ctx);
    redirect('/login?message=password-updated');
  }

  logger.error('auth:reset_password_failed', error || 'Failed to reset password');
  return { error };
}

/**
 * 学習画面や設定画面からのパスワード変更
 */
export async function updatePassword(formData: FormData) {
  const ctx = await getLogContext();
  const result = await updatePasswordCore(formData);

  if (result.error) {
    logger.error('auth:update_password_failed', result.error, { ...ctx });
  } else {
    logger.info('auth:update_password_success', 'User updated password from settings', ctx);
  }

  return result;
}