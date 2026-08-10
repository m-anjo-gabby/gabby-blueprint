'use server';

import { createPortalAuthActions } from '@gabby/lib/auth/portalActions';
import { USER_TYPES } from '@gabby/types/user';

/**
 * Coach portal authentication actions
 * After sign-in, verifies that user_type is coach ('2')
 */
const { signIn, signOut, forgotPassword, resetPassword, updatePassword } = createPortalAuthActions({
  appName: 'coach',
  unexpectedErrorMessage: 'An unexpected error occurred',
  guardUser: (user) =>
    user.app_metadata?.user_type === USER_TYPES.COACH
      ? { ok: true }
      : { ok: false, message: 'You do not have permission. Please sign in with a coach account.' },
});

export { signIn, signOut, forgotPassword, resetPassword, updatePassword };
