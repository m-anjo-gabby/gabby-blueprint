'use server';

import { createPortalAuthActions } from '@gabby/lib/auth/portalActions';
import { USER_TYPES } from '@gabby/types/user';
import { getTranslations } from 'next-intl/server';

/**
 * 管理者ポータルの認証アクション一式
 * 認証後、user_type が管理者（'0'）であることを確認します
 */
const { signIn, signOut, forgotPassword, resetPassword, updatePassword } = createPortalAuthActions({
  appName: 'admin',
  // 表示言語（NEXT_LOCALE Cookie）に合わせた文言を返す
  messages: async (code) => (await getTranslations('authErrors'))(code),
  guardUser: (user) =>
    user.app_metadata?.user_type === USER_TYPES.ADMIN
      ? { ok: true }
      : { ok: false },
});

export { signIn, signOut, forgotPassword, resetPassword, updatePassword };
