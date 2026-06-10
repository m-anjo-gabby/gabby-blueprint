'use server';

import { 
  signInCore, 
  signOutCore, 
  forgotPasswordCore, 
  resetPasswordCore, 
  updatePasswordCore 
} from '@gabby/lib/auth/actions';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { redirect } from 'next/navigation';

const logger = createLogger('admin');

/**
 * 管理者ログイン
 * 認証後、user_typeを確認します
 */
export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  // ヘッダーからコンテキスト（userId等）を抽出（未ログイン時は 'system'）
  const ctx = await getLogContext();

  try {
    const { user, error } = await signInCore(formData);
    
    // 認証エラー時は呼び出し元のフォームにメッセージを返す
    if (error || !user) {
      logger.error('auth:admin_login_failed', error || 'Unknown error', {
        ...ctx,
        payload: { email }
      });
      return { error };
    }

    // app_metadata から user_type を取得 ('0': 管理者, '1': 生徒)
    const userType = user.app_metadata?.user_type as string | undefined;
    
    // 生徒が管理者ポータルにログインしようとした場合
    if (userType !== '0') {
      logger.warn('auth:invalid_portal_access', `Student user (${user.email}) attempted to login to admin portal.`, {
        userId: user.id, // ログイン直後は user オブジェクトから ID を優先
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
  } catch (error) {
    if ((error as any).digest?.startsWith('NEXT_REDIRECT')) {
      throw error; // redirect() internal error
    }
    logger.error('auth:admin_login_unexpected', error instanceof Error ? error.message : 'Unknown error', { 
      ...ctx, 
      payload: { email } 
    });
    return { error: '予期せぬエラーが発生しました' };
  }
}

/**
 * 管理者ログアウト
 */
export async function signOut() {
  const ctx = await getLogContext();
  try {
    logger.info('auth:admin_logout', 'Admin initiated logout', ctx);
    await signOutCore();
    // 管理用ログイン画面へ戻す
    redirect('/login');
  } catch (error) {
    if ((error as any).digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    logger.error('auth:admin_logout_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    // ログアウト失敗してもリダイレクトを試みる
    redirect('/login');
  }
}

/**
 * パスワード再設定メール送信
 */
export async function forgotPassword(formData: FormData) {
  const email = formData.get('email') as string;
  const ctx = await getLogContext();
  try {
    const result = await forgotPasswordCore(formData);

    if (result.error) {
      logger.error('auth:admin_forgot_password_failed', result.error, { ...ctx, payload: { email } });
    } else {
      logger.info('auth:admin_forgot_password_sent', `Reset email sent to: ${email}`, ctx);
    }

    return result;
  } catch (error) {
    logger.error('auth:admin_forgot_password_unexpected', error instanceof Error ? error.message : 'Unknown error', { 
      ...ctx, 
      payload: { email } 
    });
    return { error: '予期せぬエラーが発生しました' };
  }
}

/**
 * パスワード更新（メールリンクからの復帰時）
 */
export async function resetPassword(formData: FormData) {
  const ctx = await getLogContext();
  try {
    const { success, error } = await resetPasswordCore(formData);
    
    if (success) {
      logger.info('auth:admin_reset_password_success', 'Admin successfully reset password via email link', ctx);
      
      // 💡 クライアント側（UpdatePasswordPage）で完了表示を見せてから
      // 画面側で安全に遷移させるため、ここではリダイレクトせず正常ステータスを返却します
      return { success: true };
    }

    // 強度バリデーションエラーや重複・漏洩エラーなど、コアで翻訳されたメッセージを安全に中継
    logger.error('auth:admin_reset_password_failed', error || 'Failed to reset password', ctx);
    return { error };
  } catch (error) {
    if ((error as any).digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    logger.error('auth:admin_reset_password_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    return { error: '予期せぬエラーが発生しました' };
  }
}

/**
 * プロフィール画面等からのパスワード変更
 */
export async function updatePassword(formData: FormData) {
  const ctx = await getLogContext();
  try {
    const result = await updatePasswordCore(formData);

    if (result.error) {
      logger.error('auth:admin_update_password_failed', result.error, ctx);
    } else {
      logger.info('auth:admin_update_password_success', 'Admin updated password from settings', ctx);
    }

    return result;
  } catch (error) {
    logger.error('auth:admin_update_password_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    return { error: '予期せぬエラーが発生しました' };
  }
}