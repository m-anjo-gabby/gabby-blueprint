'use server';

import { signInCore, signOutCore } from '@gabby/lib/auth/actions';
import { USER_TYPES } from '@gabby/types/user';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { redirect } from 'next/navigation';

const logger = createLogger('coach');

/**
 * コーチログイン
 * 認証後、user_type がコーチ（'2'）であることを確認します
 */
export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const ctx = await getLogContext();

  try {
    const { user, error } = await signInCore(formData);

    if (error || !user) {
      logger.error('auth:coach_login_failed', error || 'Unknown error', {
        ...ctx,
        payload: { email }
      });
      return { error };
    }

    const userType = user.app_metadata?.user_type as string | undefined;

    // コーチ以外がコーチポータルにログインしようとした場合
    if (userType !== USER_TYPES.COACH) {
      logger.warn('auth:invalid_portal_access', `Non-coach user (${user.email}) attempted to login to coach portal.`, {
        userId: user.id,
        payload: { userType }
      });
      await signOutCore();
      return { error: '権限がありません。コーチ用アカウントでログインしてください。' };
    }

    logger.info('auth:coach_login_success', `Coach logged in (User ID: ${user.id})`, {
      userId: user.id,
      payload: { roles: user.app_metadata?.roles }
    });
    redirect('/dashboard');
  } catch (error) {
    if ((error as any).digest?.startsWith('NEXT_REDIRECT')) {
      throw error; // redirect() internal error
    }
    logger.error('auth:coach_login_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      payload: { email }
    });
    return { error: '予期せぬエラーが発生しました' };
  }
}

/**
 * コーチログアウト
 */
export async function signOut() {
  const ctx = await getLogContext();
  try {
    logger.info('auth:coach_logout', 'Coach initiated logout', ctx);
    await signOutCore();
    redirect('/login');
  } catch (error) {
    if ((error as any).digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    logger.error('auth:coach_logout_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    redirect('/login');
  }
}
