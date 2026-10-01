'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { AuthLabels, PasswordFieldLabels } from '@gabby/lib/components/auth/types';

/** 新しいパスワード欄の文言（再設定・招待・プロフィールのパスワード変更で共通） */
export function usePasswordFieldLabels(): PasswordFieldLabels {
  const t = useTranslations('passwordFields');
  const tErrors = useTranslations('authErrors');
  return useMemo(
    () => ({
      newPassword: t('newPassword'),
      confirmPassword: t('confirmPassword'),
      requirement: t('requirement'),
      tooShort: tErrors('password_too_short'),
      needsAlnum: tErrors('password_needs_alnum'),
      match: t('match'),
      mismatch: t('mismatch'),
    }),
    [t, tErrors]
  );
}

/** 認証画面（ログイン・パスワード忘れ・再設定・招待）の文言を、表示言語に合わせて組み立てる */
export function useAuthLabels(): AuthLabels {
  const tLogin = useTranslations('login');
  const tForgot = useTranslations('forgotPassword');
  const tUpdate = useTranslations('updatePassword');
  const tInvite = useTranslations('invite');
  const tErrors = useTranslations('authErrors');
  const passwordFields = usePasswordFieldLabels();

  return useMemo(
    () => ({
      login: {
        subtitle: tLogin('subtitle'),
        emailLabel: tLogin('emailLabel'),
        emailPlaceholder: 'admin@example.com',
        passwordLabel: tLogin('passwordLabel'),
        forgotPassword: tLogin('forgotPasswordLink'),
        submit: tLogin('submit'),
        submitting: tLogin('submitting'),
        invalidLinkTitle: tLogin('invalidLinkTitle'),
        invalidLinkBody: tLogin('invalidLinkBody'),
        linkErrorNotice: tLogin('linkErrorNotice'),
      },
      forgotPassword: {
        title: tForgot('title'),
        description: tForgot('description'),
        emailLabel: tForgot('emailLabel'),
        emailPlaceholder: 'admin@example.com',
        submit: tForgot('submit'),
        submitting: tForgot('submitting'),
        sentTitle: tForgot('sentTitle'),
        sentBody: tForgot('sentBody'),
        backToLogin: tForgot('backToLogin'),
      },
      updatePassword: {
        verifying: tUpdate('verifying'),
        guideTitle: tUpdate('guideTitle'),
        guideBody: tUpdate('guideBody'),
        guideAction: tUpdate('guideAction'),
        formTitle: tUpdate('formTitle'),
        formDescription: tUpdate('formDescription'),
        submit: tUpdate('submit'),
        submitting: tUpdate('submitting'),
        successTitle: tUpdate('successTitle'),
        successBody: tUpdate('successBody'),
        successAction: tUpdate('successAction'),
        invalidTitle: tUpdate('invalidTitle'),
        invalidBody: tUpdate('invalidBody'),
        invalidAction: tUpdate('invalidAction'),
        backToLogin: tUpdate('backToLogin'),
        networkError: tUpdate('networkError'),
      },
      invite: {
        verifying: tInvite('verifying'),
        formTitle: tInvite('formTitle'),
        formDescription: ({ name, email }) => tInvite('formDescription', { name, email }),
        fallbackName: tInvite('fallbackName'),
        submit: tInvite('submit'),
        submitting: tInvite('submitting'),
        expiredTitle: tInvite('expiredTitle'),
        invalidTitle: tInvite('invalidTitle'),
        backToLogin: tInvite('backToLogin'),
        unexpected: tErrors('unexpected'),
      },
      passwordFields,
    }),
    [tLogin, tForgot, tUpdate, tInvite, tErrors, passwordFields]
  );
}
