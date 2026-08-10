'use server';

import { createPortalAuthActions } from '@gabby/lib/auth/portalActions';
import { USER_TYPES } from '@gabby/types/user';

/**
 * 管理者ポータルの認証アクション一式
 * 認証後、user_type が管理者（'0'）であることを確認します
 */
const { signIn, signOut, forgotPassword, resetPassword, updatePassword } = createPortalAuthActions({
  appName: 'admin',
  unexpectedErrorMessage: '予期せぬエラーが発生しました',
  guardUser: (user) =>
    user.app_metadata?.user_type === USER_TYPES.ADMIN
      ? { ok: true }
      : { ok: false, message: '権限がありません。生徒用サイトからログインしてください。' },
});

export { signIn, signOut, forgotPassword, resetPassword, updatePassword };
