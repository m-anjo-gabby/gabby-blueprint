'use server';

import { createPortalAuthActions } from '@gabby/lib/auth/portalActions';
import { USER_TYPES } from '@gabby/types/user';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';

/**
 * コーチのポータルの認証のアクション
 * サインインの後、user_type がコーチ（'2'）であることを確かめる
 */
const {
  signIn,
  signOut,
  forgotPassword,
  resetPassword,
  updatePassword,
  verifyRecovery,
  hasRecoverySession,
  verifyInvitation,
  acceptInvitation,
} = createPortalAuthActions({
  appName: 'coach',
  messages: (code) => AUTH_ERROR_MESSAGES[code],
  // パスワード再設定のメールは英語で送る
  resetMailLanguage: 'en',
  guardUser: (user) => (user.app_metadata?.user_type === USER_TYPES.COACH ? { ok: true } : { ok: false }),
});

export {
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
