'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { RETURN_TO_PARAM } from '../../auth/returnTo';
import { useHydrated } from '../../hooks/useHydrated';
import { useLoginNotice } from '../../hooks/useLoginNotice';
import ConfirmContainer from '../common/ConfirmContainer';
import { LoginNoticeBanner } from '../common/LoginNoticeBanner';
import { PasswordInput } from '../common/PasswordInput';
import { SubmitButton } from '../common/SubmitButton';
import { AuthPage, EmailField, FormError } from './AuthLayout';
import type { FormAuthAction, LoginLabels } from './types';

interface LoginFormProps {
  /** 各アプリの signIn（成功時はサーバー側でリダイレクトする） */
  action: FormAuthAction;
  labels: LoginLabels;
  /** 案内文の上に出すポータル名等（任意） */
  badge?: ReactNode;
}

/** ログイン画面（3アプリ共通） */
export function LoginForm({ action, labels, badge }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isHydrated = useHydrated();
  const notice = useLoginNotice({ invalidLinkTitle: labels.invalidLinkTitle, invalidLinkBody: labels.invalidLinkBody });

  const handleSubmit = async (formData: FormData) => {
    // 送信開始時にフォーカスを外し、スマートフォンのキーボードを閉じる
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    setError(null);
    // 未ログインで開いた画面（?next=、メール内のリンク等）へ、ログイン後に戻す
    formData.set(RETURN_TO_PARAM, new URLSearchParams(window.location.search).get(RETURN_TO_PARAM) ?? '');
    const result = await action(formData);

    // 成功時はサーバー側でリダイレクトするため、戻ってくるのは失敗時のみ
    if (result?.error) {
      setError(result.error);
      setPassword(''); // 認証失敗時はパスワードのみを空にする
    }
  };

  return (
    <AuthPage>
      <div className="text-center space-y-4 mb-8">
        <div className="flex justify-center">
          <Image
            src="/logo-01.png"
            alt="Gabby Blueprint English"
            width={320}
            height={85}
            className="h-auto w-auto max-w-60 md:max-w-[320px]"
            priority
          />
        </div>
        <div className="space-y-1">
          {badge}
          <p className="text-xs text-slate-500">{labels.subtitle}</p>
        </div>
      </div>

      {/* 入力できる状態になったことを data-ready で示す（E2E はこれを待ってから入力する。KJ-2026-0928-02） */}
      <form action={handleSubmit} className="space-y-5" data-ready={isHydrated ? 'true' : undefined}>
        <LoginNoticeBanner
          notice={notice}
          messages={{ link_error: labels.linkErrorNotice }}
        />

        <div className="space-y-4">
          <EmailField
            label={labels.emailLabel}
            placeholder={labels.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <PasswordInput
            label={labels.passwordLabel}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs text-brand hover:text-brand-strong font-medium hover:underline transition-all"
            >
              {labels.forgotPassword}
            </Link>
          </div>
        </div>

        <FormError message={error} />

        <SubmitButton label={labels.submit} loadingLabel={labels.submitting} />
      </form>

      <ConfirmContainer />
    </AuthPage>
  );
}
