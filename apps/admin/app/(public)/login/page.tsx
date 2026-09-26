// src/app/(public)/login/page.tsx
'use client';

import { signIn } from '@/actions/adminAuthAction';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LoginButton } from './_components/LoginButton';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import ConfirmContainer from '@gabby/lib/components/common/ConfirmContainer';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@gabby/lib/components/common/PasswordInput';
import LocaleSwitcher from '@/components/common/LocaleSwitcher';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { showConfirm } = useConfirm();
  const router = useRouter();
  const t = useTranslations('login');

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('error_description')) {
      const params = new URLSearchParams(hash.substring(1));
      const errorDesc = params.get('error_description');

      if (errorDesc) {
        // ダイアログを表示してユーザーのアクションを促す
        const handleShowError = async () => {
          const confirmed = await showConfirm(
            t('invalidLinkTitle'),
            t('invalidLinkBody'),
            { variant: 'info' } // 必要に応じて 'danger' などに変更可
          );

          if (confirmed) {
            router.push('/forgot-password');
          }
        };

        handleShowError();
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [showConfirm, router, t]);

  // loadingステートを手動で管理する必要がなくなります
  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const result = await signIn(formData);
    
    // エラーハンドリング（サインイン処理内の成功時はリダイレクト）
    if (result && result.error) {
      setError(result.error);
      setPassword(''); // 認証失敗時はパスワードのみを空にする
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="absolute top-4 right-4">
        <LocaleSwitcher />
      </div>
      <div className="w-full max-w-md space-y-8">

        {/* ログインカード */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <div className="text-center space-y-4 mb-8">
            <div className="flex justify-center">
              <Image
                src="/logo-01.png"
                alt="Gabby Mobile Logo"
                width={320}
                height={85}
                className="h-auto w-auto max-w-60 md:max-w-[320px]"
                priority
              />
            </div>
            <p className="text-xs text-slate-500">{t('subtitle')}</p>
          </div>

          <form action={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              {/* メールアドレス */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 ml-1 uppercase tracking-wider">{t('emailLabel')}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="account@example.com"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-base"
                  />
                </div>
              </div>

              {/* パスワード */}
              <div className="space-y-2">
                <PasswordInput
                  label={t('passwordLabel')}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {/* パスワード忘れ */}
              <div className="flex justify-end mt-2">
                <a
                  href="/forgot-password"
                  className="text-xs text-brand hover:text-brand-strong font-medium hover:underline transition-all"
                >
                  {t('forgotPasswordLink')}
                </a>
              </div>

            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2 text-red-600">
                <span className="text-xs font-medium">{error}</span>
              </div>
            )}

            {/* ログインボタンコンポーネントを使用 */}
            <LoginButton />
          </form>
        </div>

        <p className="text-center text-[10px] text-slate-400 tracking-widest uppercase">
          {t('copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
      {/* 確認ダイアログ */}
      <ConfirmContainer />
    </div>
  );
}