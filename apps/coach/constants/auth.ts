import type { AuthErrorCode } from '@gabby/lib/auth/errors';
import type { LoginNotice, LoginNoticeLabels } from '@gabby/lib/hooks/useLoginNotice';

/** Messages for sign-in / password reset / password change errors (coach portal) */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  missing_credentials: 'Please enter your email address and password.',
  account_locked: 'Your account is temporarily locked. Please try again later.',
  account_locked_now: 'Too many failed attempts. Your account has been locked for 30 minutes.',
  invalid_credentials: 'Incorrect email address or password.',
  license_not_found: 'No valid license was found. Please contact your administrator.',
  portal_forbidden: 'You do not have permission. Please sign in with a coach account.',
  signout_failed: 'An error occurred while signing out.',
  missing_email: 'Please enter your email address.',
  reset_email_failed: 'Failed to send the email. Please try again later.',
  password_too_short: 'Password must be at least 8 characters long.',
  password_needs_alnum: 'Password must contain both letters and numbers.',
  password_same_as_old: 'Your new password must be different from your current password.',
  password_leaked: 'This password has appeared in a data breach and cannot be used. Please choose another one.',
  password_weak: 'This password is too simple or easy to guess. Please choose a stronger password.',
  session_invalid: 'Your session is invalid or has expired. Please sign out, sign in again, and retry.',
  password_update_failed: 'Failed to update your password.',
  session_timeout: 'Your session has timed out. Please sign in again.',
  current_password_incorrect: 'Your current password is incorrect.',
  unexpected: 'An unexpected error occurred. Please try again later.',
};

/** Dialog shown when returning to sign-in from a used or expired reset link */
export const LOGIN_NOTICE_LABELS: LoginNoticeLabels = {
  invalidLinkTitle: 'This link is invalid',
  invalidLinkBody: 'This reset link has already been used or has expired. Would you like to send another reset email?',
};

/** Notices shown above the sign-in form */
export const LOGIN_NOTICE_MESSAGES: Record<LoginNotice, string> = {
  password_updated: 'Your password has been updated. Please sign in with your new password.',
  link_error: "We couldn't verify the link. Please try again or contact your administrator.",
};
