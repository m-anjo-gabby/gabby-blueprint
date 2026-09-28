'use server';

import { createPortalAuthActions } from '@gabby/lib/auth/portalActions';
import { AUTH_ERROR_MESSAGES_JA } from '@gabby/lib/auth/errors';
import { USER_TYPES } from '@gabby/types/user';

/**
 * 生徒ポータルの認証アクション一式
 * 誤って管理者がここからログインした場合は拒否します。
 * ログイン時はライセンスチェックを有効化します。
 */
const { signIn, signOut, forgotPassword, resetPassword, updatePassword } = createPortalAuthActions({
  appName: 'student',
  messages: (code) =>
    code === 'portal_forbidden'
      ? '管理者アカウントです。管理画面からログインしてください。'
      : AUTH_ERROR_MESSAGES_JA[code],
  signInOptions: { checkLicense: true },
  signOutMode: 'revalidate',
  guardUser: (user) =>
    user.app_metadata?.user_type === USER_TYPES.ADMIN
      ? { ok: false }
      : { ok: true },
});

export { signIn, signOut, forgotPassword, resetPassword, updatePassword };
