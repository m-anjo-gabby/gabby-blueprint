'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { SubmitButton } from '../common/SubmitButton';
import { AuthHeading, AuthLinkButton, AuthPage, AuthStatus, AuthStep, FormError } from './AuthLayout';
import { EMPTY_NEW_PASSWORD, NewPasswordFields, validateNewPassword, type NewPasswordValue } from './NewPasswordFields';
import type { AuthActionResult, FormAuthAction, InvitationCheckResult, InviteLabels, PasswordFieldLabels } from './types';

export interface InviteActions {
  verifyInvitation: (token: string) => Promise<InvitationCheckResult>;
  acceptInvitation: (token: string, password: string) => Promise<AuthActionResult>;
  /** 本登録後の自動ログイン（成功時はサーバー側でリダイレクトする） */
  signIn: FormAuthAction;
}

interface InviteSetupFlowProps {
  actions: InviteActions;
  labels: InviteLabels;
  passwordLabels: PasswordFieldLabels;
}

type ViewState =
  | { status: 'loading' }
  | { status: 'form'; email: string; name: string }
  | { status: 'expired' | 'invalid'; message: string };

/** 招待リンクからの本登録（パスワード設定）画面（3アプリ共通） */
export function InviteSetupFlow(props: InviteSetupFlowProps) {
  return (
    <Suspense
      fallback={
        <AuthPage>
          <AuthStatus tone="loading" title={props.labels.verifying} />
        </AuthPage>
      }
    >
      <InviteSetupContent {...props} />
    </Suspense>
  );
}

function InviteSetupContent({ actions, labels, passwordLabels }: InviteSetupFlowProps) {
  const token = useSearchParams().get('token') ?? '';
  const [view, setView] = useState<ViewState>({ status: 'loading' });
  const [password, setPassword] = useState<NewPasswordValue>(EMPTY_NEW_PASSWORD);
  const [error, setError] = useState<string | null>(null);

  const { verifyInvitation } = actions;
  const { fallbackName } = labels;
  useEffect(() => {
    let cancelled = false;
    verifyInvitation(token)
      .then((result) => {
        if (cancelled) return;
        if (result.valid) {
          setView({ status: 'form', email: result.invitation.email, name: result.invitation.userName || fallbackName });
        } else {
          setView({ status: result.errorCode === 'invitation_expired' ? 'expired' : 'invalid', message: result.error });
        }
      })
      .catch(() => {
        if (!cancelled) setView({ status: 'invalid', message: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [token, verifyInvitation, fallbackName]);

  const handleSubmit = async () => {
    if (view.status !== 'form') return;

    const validationError = validateNewPassword(password, passwordLabels);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    try {
      const result = await actions.acceptInvitation(token, password.password);
      if (!result.success) {
        setError(result.error || labels.unexpected);
        return;
      }

      // 本登録が済んだら、そのままログインする（成功時はサーバー側でリダイレクト）
      const loginFormData = new FormData();
      loginFormData.append('email', view.email);
      loginFormData.append('password', password.password);
      const loginResult = await actions.signIn(loginFormData);
      if (loginResult?.error) setError(loginResult.error);
    } catch {
      setError(labels.unexpected);
    }
  };

  return (
    <AuthPage>
      <AnimatePresence mode="wait">
        {view.status === 'loading' && (
          <AuthStep key="loading">
            <AuthStatus tone="loading" title={labels.verifying} />
          </AuthStep>
        )}

        {(view.status === 'expired' || view.status === 'invalid') && (
          <AuthStep key="error">
            <AuthStatus
              tone="warning"
              title={view.status === 'expired' ? labels.expiredTitle : labels.invalidTitle}
              action={
                <AuthLinkButton href="/login">
                  <ArrowLeft size={16} aria-hidden /> {labels.backToLogin}
                </AuthLinkButton>
              }
            >
              {view.message || labels.unexpected}
            </AuthStatus>
          </AuthStep>
        )}

        {view.status === 'form' && (
          <AuthStep key="form">
            <AuthHeading title={labels.formTitle} description={labels.formDescription({ name: view.name, email: view.email })} />
            <form action={handleSubmit} className="space-y-6">
              <NewPasswordFields
                labels={passwordLabels}
                value={password}
                onChange={(next) => {
                  setPassword(next);
                  setError(null);
                }}
              />
              <FormError message={error} />
              <SubmitButton label={labels.submit} loadingLabel={labels.submitting} trailingIcon={<ArrowRight aria-hidden />} />
            </form>
          </AuthStep>
        )}
      </AnimatePresence>
    </AuthPage>
  );
}
