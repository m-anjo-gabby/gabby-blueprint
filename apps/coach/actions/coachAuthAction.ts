'use server';

import { createPortalAuthActions } from '@gabby/lib/auth/portalActions';
import { USER_TYPES } from '@gabby/types/user';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';

/**
 * Coach portal authentication actions
 * After sign-in, verifies that user_type is coach ('2')
 */
const { signIn, signOut, forgotPassword, resetPassword, updatePassword } = createPortalAuthActions({
  appName: 'coach',
  messages: (code) => AUTH_ERROR_MESSAGES[code],
  guardUser: (user) =>
    user.app_metadata?.user_type === USER_TYPES.COACH
      ? { ok: true }
      : { ok: false },
});

export { signIn, signOut, forgotPassword, resetPassword, updatePassword };
