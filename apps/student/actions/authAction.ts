'use server';

import { createPortalAuthActions } from '@gabby/lib/auth/portalActions';
import { USER_TYPES } from '@gabby/types/user';

/**
 * 生徒ポータルの認証アクション一式
 * 誤って管理者がここからログインした場合は拒否します。
 * ログイン時はライセンスチェックを有効化します。
 */
const { signIn, signOut, forgotPassword, resetPassword, updatePassword } = createPortalAuthActions({
  appName: 'student',
  unexpectedErrorMessage: '予期せぬエラーが発生しました',
  signInOptions: { checkLicense: true },
  signOutMode: 'revalidate',
  guardUser: (user) =>
    user.app_metadata?.user_type === USER_TYPES.ADMIN
      ? { ok: false, message: '管理者アカウントです。管理画面からログインしてください。' }
      : { ok: true },
});

export { signIn, signOut, forgotPassword, resetPassword, updatePassword };
