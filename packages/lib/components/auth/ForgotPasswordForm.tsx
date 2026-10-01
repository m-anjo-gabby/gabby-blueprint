'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { SubmitButton } from '../common/SubmitButton';
import { AuthBackLink, AuthHeading, AuthLinkButton, AuthPage, AuthStatus, AuthStep, EmailField, FormError } from './AuthLayout';
import type { ForgotPasswordLabels, FormAuthAction } from './types';

interface ForgotPasswordFormProps {
  /** 各アプリの forgotPassword */
  action: FormAuthAction;
  labels: ForgotPasswordLabels;
}

/**
 * パスワード忘れ（再設定メールの依頼）画面（3アプリ共通）
 * 登録の有無を外部から判別させないため、サーバーは未登録のアドレスでも成功を返す。
 */
export function ForgotPasswordForm({ action, labels }: ForgotPasswordFormProps) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const result = await action(formData);
    if (result?.error) setError(result.error);
    else setSent(true);
  };

  return (
    <AuthPage>
      <AnimatePresence mode="wait">
        {!sent ? (
          <AuthStep key="form">
            <AuthHeading title={labels.title} description={labels.description} />
            <form action={handleSubmit} className="space-y-6">
              <EmailField label={labels.emailLabel} placeholder={labels.emailPlaceholder} />
              <FormError message={error} />
              <SubmitButton label={labels.submit} loadingLabel={labels.submitting} />
              <AuthBackLink>{labels.backToLogin}</AuthBackLink>
            </form>
          </AuthStep>
        ) : (
          <AuthStep key="sent">
            <AuthStatus
              tone="success"
              title={labels.sentTitle}
              action={
                <AuthLinkButton href="/login">
                  <ArrowLeft size={16} aria-hidden /> {labels.backToLogin}
                </AuthLinkButton>
              }
            >
              {labels.sentBody}
            </AuthStatus>
          </AuthStep>
        )}
      </AnimatePresence>
    </AuthPage>
  );
}
