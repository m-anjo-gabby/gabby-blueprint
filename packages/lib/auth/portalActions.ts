import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createLogger } from '../logger';
import { getLogContext } from '../logger/context';
import {
  signInCore,
  signOutCore,
  forgotPasswordCore,
  resetPasswordCore,
  updatePasswordCore,
} from './actions';

type GuardResult = { ok: true } | { ok: false; message: string };

export interface PortalAuthConfig {
  /** ロガーの名前空間、かつログイベント名の接頭辞として使用 */
  appName: 'admin' | 'coach' | 'student';
  /** ログイン成功後のリダイレクト先（デフォルト: '/dashboard'） */
  dashboardPath?: string;
  /** ログアウト後のリダイレクト先（デフォルト: '/login'。signOutMode: 'revalidate' の場合は未使用） */
  loginPath?: string;
  /** try/catchで捕捉した予期せぬエラー時にユーザーへ返すメッセージ */
  unexpectedErrorMessage: string;
  /** signInCore に渡す追加オプション（生徒ポータルのライセンスチェック等） */
  signInOptions?: { checkLicense?: boolean };
  /** ログイン成功後、そのユーザーがこのポータルへのアクセスを許可されるかを判定する */
  guardUser: (user: User) => GuardResult;
  /**
   * ログアウト後の挙動。
   * 'redirect'（デフォルト）: サーバー側で loginPath へリダイレクト
   * 'revalidate': revalidatePath のみ行い、画面遷移はクライアント側に委ねる
   */
  signOutMode?: 'redirect' | 'revalidate';
}

function isRedirectError(error: unknown): boolean {
  return typeof (error as { digest?: unknown })?.digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT');
}

/**
 * 3ポータル（admin/coach/student）で共通の認証アクション一式を生成するファクトリ。
 * try/catch・NEXT_REDIRECTの再throw・ロギングのパターンを集約し、
 * 各アプリの *AuthAction.ts はポータル固有の設定（許可するuser_type、文言等）を
 * 渡すだけで済むようにする。
 */
export function createPortalAuthActions(config: PortalAuthConfig) {
  const logger = createLogger(config.appName);
  const dashboardPath = config.dashboardPath ?? '/dashboard';
  const loginPath = config.loginPath ?? '/login';
  const signOutMode = config.signOutMode ?? 'redirect';

  async function signIn(formData: FormData) {
    const email = formData.get('email') as string;
    const ctx = await getLogContext();

    try {
      const { user, error } = await signInCore(formData, config.signInOptions);

      if (error || !user) {
        logger.error(`auth:${config.appName}_login_failed`, error || 'Unknown error', {
          ...ctx,
          payload: { email },
        });
        return { error };
      }

      const guard = config.guardUser(user);
      if (!guard.ok) {
        logger.warn(
          'auth:invalid_portal_access',
          `Rejected user (${user.email}) attempted to login to ${config.appName} portal.`,
          {
            userId: user.id,
            payload: { userType: user.app_metadata?.user_type },
          }
        );
        // リダイレクトループを防ぐため、不許可ユーザーのセッションは即座に破棄する
        await signOutCore();
        return { error: guard.message };
      }

      logger.info(`auth:${config.appName}_login_success`, `User logged in (User ID: ${user.id})`, {
        userId: user.id,
        payload: { roles: user.app_metadata?.roles, isLicensed: user.app_metadata?.is_licensed },
      });
      redirect(dashboardPath);
    } catch (error) {
      if (isRedirectError(error)) {
        throw error; // redirect() internal error
      }
      logger.error(
        `auth:${config.appName}_login_unexpected`,
        error instanceof Error ? error.message : 'Unknown error',
        { ...ctx, payload: { email } }
      );
      return { error: config.unexpectedErrorMessage };
    }
  }

  async function signOut() {
    const ctx = await getLogContext();
    // ログアウト前にイベントを記録（セッションが切れる前に行う）
    logger.info(`auth:${config.appName}_logout`, `${config.appName} user initiated logout`, ctx);

    if (signOutMode === 'revalidate') {
      await signOutCore();
      // 全てのサーバーキャッシュを無効化（画面遷移はクライアント側に委ねる）
      revalidatePath('/', 'layout');
      return;
    }

    try {
      await signOutCore();
      redirect(loginPath);
    } catch (error) {
      if (isRedirectError(error)) {
        throw error;
      }
      logger.error(
        `auth:${config.appName}_logout_unexpected`,
        error instanceof Error ? error.message : 'Unknown error',
        ctx
      );
      // ログアウト失敗してもリダイレクトを試みる
      redirect(loginPath);
    }
  }

  async function forgotPassword(formData: FormData) {
    const email = formData.get('email') as string;
    const ctx = await getLogContext();

    try {
      const result = await forgotPasswordCore(formData);

      if (result.error) {
        logger.error(`auth:${config.appName}_forgot_password_failed`, result.error, {
          ...ctx,
          payload: { email },
        });
      } else {
        logger.info(`auth:${config.appName}_forgot_password_sent`, `Reset email sent to: ${email}`, ctx);
      }

      return result;
    } catch (error) {
      if (isRedirectError(error)) {
        throw error;
      }
      logger.error(
        `auth:${config.appName}_forgot_password_unexpected`,
        error instanceof Error ? error.message : 'Unknown error',
        { ...ctx, payload: { email } }
      );
      return { error: config.unexpectedErrorMessage };
    }
  }

  async function resetPassword(formData: FormData) {
    const ctx = await getLogContext();

    try {
      const { success, error } = await resetPasswordCore(formData);

      if (success) {
        logger.info(
          `auth:${config.appName}_reset_password_success`,
          `${config.appName} user successfully reset password via email link`,
          ctx
        );
        // 💡 クライアント側で完了表示を見せてから安全に遷移させるため、ここではリダイレクトしない
        return { success: true };
      }

      logger.error(`auth:${config.appName}_reset_password_failed`, error || 'Failed to reset password', ctx);
      return { error };
    } catch (error) {
      if (isRedirectError(error)) {
        throw error;
      }
      logger.error(
        `auth:${config.appName}_reset_password_unexpected`,
        error instanceof Error ? error.message : 'Unknown error',
        ctx
      );
      return { error: config.unexpectedErrorMessage };
    }
  }

  async function updatePassword(formData: FormData) {
    const ctx = await getLogContext();

    try {
      const result = await updatePasswordCore(formData);

      if (result.error) {
        logger.error(`auth:${config.appName}_update_password_failed`, result.error, ctx);
      } else {
        logger.info(`auth:${config.appName}_update_password_success`, `${config.appName} user updated password from settings`, ctx);
      }

      return result;
    } catch (error) {
      if (isRedirectError(error)) {
        throw error;
      }
      logger.error(
        `auth:${config.appName}_update_password_unexpected`,
        error instanceof Error ? error.message : 'Unknown error',
        ctx
      );
      return { error: config.unexpectedErrorMessage };
    }
  }

  return { signIn, signOut, forgotPassword, resetPassword, updatePassword };
}
