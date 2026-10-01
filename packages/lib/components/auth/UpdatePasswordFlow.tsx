'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { SubmitButton } from '../common/SubmitButton';
import { AuthBackLink, AuthHeading, AuthLinkButton, AuthPage, AuthStatus, AuthStep, FormError } from './AuthLayout';
import { EMPTY_NEW_PASSWORD, NewPasswordFields, validateNewPassword, type NewPasswordValue } from './NewPasswordFields';
import type { AuthActionResult, FormAuthAction, PasswordFieldLabels, UpdatePasswordLabels } from './types';

export interface UpdatePasswordActions {
  /** 再設定リンク（token_hash）をサーバーで確認する */
  verifyRecovery: (tokenHash: string) => Promise<AuthActionResult>;
  /** 再設定リンクの確認が済んだセッションか */
  hasRecoverySession: () => Promise<boolean>;
  /** 新しいパスワードを設定する（完了後もこの端末のログインは保ち、他の端末はログアウトさせる） */
  resetPassword: FormAuthAction;
}

interface UpdatePasswordFlowProps {
  actions: UpdatePasswordActions;
  labels: UpdatePasswordLabels;
  passwordLabels: PasswordFieldLabels;
  /** 完了後に移る画面（ログイン後の起点） */
  homePath?: string;
}

type ViewStatus = 'initializing' | 'guide' | 'form' | 'success' | 'invalid';

/**
 * パスワード再設定画面（3アプリ共通）
 *
 * 1. 再設定リンク（?token_hash=...&type=recovery）で開いた場合は案内（guide）を出し、ボタン操作でサーバーがリンクを確認する
 *    （メーラーの事前読み込みでトークンが消費されないよう、表示しただけでは確認しない）
 * 2. 確認が済んだセッションだけがフォームを使える。ログイン中でもリンクを確認していなければ invalid
 *    （プロフィールのパスワード変更の「現在のパスワード」確認を迂回させないため）
 * 3. 更新後はそのままログインした状態でダッシュボードへ移る（他の端末はサーバー側でログアウトさせる）
 */
export function UpdatePasswordFlow(props: UpdatePasswordFlowProps) {
  return (
    <Suspense
      fallback={
        <AuthPage>
          <AuthStatus tone="loading" title={props.labels.verifying} />
        </AuthPage>
      }
    >
      <UpdatePasswordContent {...props} />
    </Suspense>
  );
}

function UpdatePasswordContent({ actions, labels, passwordLabels, homePath = '/dashboard' }: UpdatePasswordFlowProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get('token_hash');
  const hasRecoveryToken = !!tokenHash && searchParams.get('type') === 'recovery';

  const [viewStatus, setViewStatus] = useState<ViewStatus>(hasRecoveryToken ? 'guide' : 'initializing');
  const [verifying, setVerifying] = useState(false);
  const [password, setPassword] = useState<NewPasswordValue>(EMPTY_NEW_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  // トークンが無い場合（リンク確認後の再読み込み等）は、確認が済んだセッションかをサーバーで判定する
  const { hasRecoverySession } = actions;
  useEffect(() => {
    if (hasRecoveryToken) return;
    let cancelled = false;
    hasRecoverySession()
      .then((ok) => {
        if (!cancelled) setViewStatus((current) => (current === 'success' ? current : ok ? 'form' : 'invalid'));
      })
      .catch(() => {
        if (!cancelled) setViewStatus('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [hasRecoveryToken, hasRecoverySession]);

  const handleStart = async () => {
    if (!tokenHash) {
      setViewStatus('invalid');
      return;
    }
    setVerifying(true);
    try {
      const result = await actions.verifyRecovery(tokenHash);
      if (result.success) {
        setViewStatus('form');
        // 使用済みのトークンをURLから外す（再読み込みしてもフォームを表示できるように）
        router.replace('/update-password');
      } else {
        setViewStatus('invalid');
      }
    } catch {
      setViewStatus('invalid');
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (formData: FormData) => {
    const validationError = validateNewPassword(password, passwordLabels);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    try {
      const result = await actions.resetPassword(formData);
      if (result?.errorCode === 'reset_link_required') {
        setViewStatus('invalid');
      } else if (result?.error) {
        setError(result.error);
      } else {
        setViewStatus('success');
        // 完了表示を見せてからダッシュボードへ（戻るで再設定画面に戻らないよう replace。アンマウント時はタイマーを解除）
        redirectTimerRef.current = setTimeout(() => router.replace(homePath), 1500);
      }
    } catch {
      setError(labels.networkError);
    }
  };

  return (
    <AuthPage>
      <AnimatePresence mode="wait">
        {viewStatus === 'initializing' && (
          <AuthStep key="initializing">
            <AuthStatus tone="loading" title={labels.verifying} />
          </AuthStep>
        )}

        {viewStatus === 'guide' && (
          <AuthStep key="guide">
            <AuthStatus
              tone="info"
              title={labels.guideTitle}
              action={
                <SubmitButton
                  type="button"
                  onClick={handleStart}
                  pending={verifying}
                  label={labels.guideAction}
                  trailingIcon={<ArrowRight aria-hidden />}
                />
              }
            >
              {labels.guideBody}
            </AuthStatus>
          </AuthStep>
        )}

        {viewStatus === 'form' && (
          <AuthStep key="form">
            <AuthHeading title={labels.formTitle} description={labels.formDescription} />
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
              <SubmitButton label={labels.submit} loadingLabel={labels.submitting} />
              <AuthBackLink>{labels.backToLogin}</AuthBackLink>
            </form>
          </AuthStep>
        )}

        {viewStatus === 'success' && (
          <AuthStep key="success">
            <AuthStatus
              tone="success"
              title={labels.successTitle}
              action={
                <AuthLinkButton href={homePath}>
                  {labels.successAction} <ArrowRight size={16} aria-hidden />
                </AuthLinkButton>
              }
            >
              {labels.successBody}
            </AuthStatus>
          </AuthStep>
        )}

        {viewStatus === 'invalid' && (
          <AuthStep key="invalid">
            <AuthStatus
              tone="warning"
              title={labels.invalidTitle}
              action={<AuthLinkButton href="/forgot-password">{labels.invalidAction}</AuthLinkButton>}
            >
              {labels.invalidBody}
            </AuthStatus>
          </AuthStep>
        )}
      </AnimatePresence>
    </AuthPage>
  );
}
