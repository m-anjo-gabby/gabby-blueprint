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
  verifyRecoveryCore,
  hasRecoverySessionCore,
  verifyInvitationCore,
  acceptInvitationCore,
  type AuthResponse,
  type VerifyInvitationResponse,
} from './core';
import { RETURN_TO_PARAM, sanitizeReturnTo } from './returnTo';
import type { MailLanguage } from '../mail/layout/document';
import {
  AUTH_ERROR_MESSAGES_JA,
  formatAuthErrorMessage,
  type AuthErrorCode,
  type AuthErrorMessageResolver,
} from './errors';

type GuardResult = { ok: true } | { ok: false };

export interface PortalAuthConfig {
  /** ロガーの名前空間、かつログイベント名の接頭辞として使用 */
  appName: 'admin' | 'coach' | 'student';
  /** ログイン成功後のリダイレクト先（デフォルト: '/dashboard'） */
  dashboardPath?: string;
  /** ログアウト後のリダイレクト先（デフォルト: '/login'。signOutMode: 'revalidate' の場合は未使用） */
  loginPath?: string;
  /**
   * エラー種別 → 画面に出す文言。アプリの表示言語で返す（admin: next-intl / coach: 英語辞書）。
   * 省略時は日本語の既定文言（AUTH_ERROR_MESSAGES_JA）。
   */
  messages?: AuthErrorMessageResolver;
  /** signInCore に渡す追加オプション（生徒ポータルのライセンスチェック等） */
  signInOptions?: { checkLicense?: boolean };
  /** パスワード再設定メールの言語（student: 'ja' / coach: 'en' / admin: 'bilingual'） */
  resetMailLanguage: MailLanguage;
  /** ログイン成功後、そのユーザーがこのポータルへのアクセスを許可されるかを判定する（不許可時の文言は `portal_forbidden`） */
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
  const resolveMessage: AuthErrorMessageResolver = config.messages ?? ((code) => AUTH_ERROR_MESSAGES_JA[code]);

  async function errorResponse(code: AuthErrorCode, detail?: string): Promise<AuthResponse> {
    return {
      error: formatAuthErrorMessage(await resolveMessage(code), detail),
      errorCode: code,
      errorDetail: detail,
    };
  }

  /** 共通処理の結果に含まれるエラー文言を、このアプリの表示言語の文言に置き換える */
  async function localize(result: AuthResponse): Promise<AuthResponse> {
    return result.errorCode ? { ...result, ...(await errorResponse(result.errorCode, result.errorDetail)) } : result;
  }

  async function signIn(formData: FormData) {
    const email = formData.get('email') as string;
    const ctx = await getLogContext();

    try {
      const result = await signInCore(formData, config.signInOptions);
      const { user } = result;

      if (result.error || !user) {
        logger.error(`auth:${config.appName}_login_failed`, result.error || 'Unknown error', {
          ...ctx,
          payload: { email },
        });
        const { error, errorCode } = await localize(result);
        return { error, errorCode };
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
        const { error, errorCode } = await errorResponse('portal_forbidden');
        return { error, errorCode };
      }

      logger.info(`auth:${config.appName}_login_success`, `User logged in (User ID: ${user.id})`, {
        userId: user.id,
        payload: { roles: user.app_metadata?.roles, isLicensed: user.app_metadata?.is_licensed },
      });
      // 未ログインで開いた画面（メール内のリンク等）があればそこへ戻す（オープンリダイレクト対策済み）
      const returnTo = sanitizeReturnTo(formData.get(RETURN_TO_PARAM) as string | null, loginPath);
      redirect(returnTo ?? dashboardPath);
    } catch (error) {
      if (isRedirectError(error)) {
        throw error; // redirect() internal error
      }
      logger.error(
        `auth:${config.appName}_login_unexpected`,
        error instanceof Error ? error.message : 'Unknown error',
        { ...ctx, err: error, payload: { email } }
      );
      return errorResponse('unexpected');
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
        { ...ctx, err: error }
      );
      // ログアウト失敗してもリダイレクトを試みる
      redirect(loginPath);
    }
  }

  async function forgotPassword(formData: FormData) {
    const email = formData.get('email') as string;
    const ctx = await getLogContext();

    try {
      const result = await forgotPasswordCore(formData, { mailLanguage: config.resetMailLanguage });

      if (result.error) {
        logger.error(`auth:${config.appName}_forgot_password_failed`, result.error, {
          ...ctx,
          payload: { email },
        });
      } else {
        logger.info(`auth:${config.appName}_forgot_password_sent`, `Reset email sent to: ${email}`, ctx);
      }

      return localize(result);
    } catch (error) {
      if (isRedirectError(error)) {
        throw error;
      }
      logger.error(
        `auth:${config.appName}_forgot_password_unexpected`,
        error instanceof Error ? error.message : 'Unknown error',
        { ...ctx, err: error, payload: { email } }
      );
      return errorResponse('unexpected');
    }
  }

  async function resetPassword(formData: FormData) {
    const ctx = await getLogContext();

    try {
      const result = await resetPasswordCore(formData);

      if (result.success) {
        logger.info(
          `auth:${config.appName}_reset_password_success`,
          `${config.appName} user successfully reset password via email link`,
          ctx
        );
        // 💡 クライアント側で完了表示を見せてから安全に遷移させるため、ここではリダイレクトしない
        return { success: true };
      }

      logger.error(`auth:${config.appName}_reset_password_failed`, result.error || 'Failed to reset password', ctx);
      const { error, errorCode } = await localize(result);
      return { error, errorCode };
    } catch (error) {
      if (isRedirectError(error)) {
        throw error;
      }
      logger.error(
        `auth:${config.appName}_reset_password_unexpected`,
        error instanceof Error ? error.message : 'Unknown error',
        { ...ctx, err: error }
      );
      return errorResponse('unexpected');
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

      return localize(result);
    } catch (error) {
      if (isRedirectError(error)) {
        throw error;
      }
      logger.error(
        `auth:${config.appName}_update_password_unexpected`,
        error instanceof Error ? error.message : 'Unknown error',
        { ...ctx, err: error }
      );
      return errorResponse('unexpected');
    }
  }

  /** 再設定リンクを確認し、再設定用のセッションを確立する（再設定画面のボタン操作から呼ぶ） */
  async function verifyRecovery(tokenHash: string): Promise<AuthResponse> {
    return localize(await verifyRecoveryCore(tokenHash));
  }

  /** 再設定リンクの確認が済んだセッションか（再設定画面を再読み込みした場合の判定） */
  async function hasRecoverySession(): Promise<boolean> {
    return hasRecoverySessionCore();
  }

  async function verifyInvitation(token: string): Promise<VerifyInvitationResponse> {
    const result = await verifyInvitationCore(token);
    if (result.valid) return result;
    const { error, errorCode } = await errorResponse(result.errorCode);
    return { valid: false, error: error ?? '', errorCode: errorCode ?? result.errorCode };
  }

  async function acceptInvitation(token: string, password: string): Promise<AuthResponse> {
    const { success, error, errorCode } = await localize(await acceptInvitationCore(token, password));
    return { success, error, errorCode };
  }

  return {
    signIn,
    signOut,
    forgotPassword,
    resetPassword,
    updatePassword,
    verifyRecovery,
    hasRecoverySession,
    verifyInvitation,
    acceptInvitation,
  };
}
