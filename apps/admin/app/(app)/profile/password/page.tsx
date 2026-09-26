// apps/admin/app/(app)/profile/password/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { updatePassword } from '@/actions/adminAuthAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { PasswordInput } from '@gabby/lib/components/common/PasswordInput';
import { SubmitButton } from '@gabby/lib/components/common/SubmitButton';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

/**
 * パスワード変更ページ（管理者ポータル）
 * ログイン中の管理者が自身のパスワードを更新するための画面
 */
export default function PasswordChangePage() {
  const t = useTranslations('profile.password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordGeneralError, setNewPasswordGeneralError] = useState<string | null>(null);

  const { showToast } = useToast();
  const router = useRouter();

  const strengthStatus = useMemo(() => {
    if (!newPassword) return null;
    const hasAlpha = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    return hasAlpha && hasNumber;
  }, [newPassword]);

  const matchStatus = useMemo(() => {
    if (!newPassword || !confirmPassword) return null;
    return newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  const handleSubmit = async (formData: FormData) => {
    setCurrentPasswordError(null);
    setNewPasswordGeneralError(null);

    if (newPassword.length < 8) {
      setNewPasswordGeneralError(t('errorTooShort'));
      return;
    }

    if (strengthStatus === false) {
      setNewPasswordGeneralError(t('errorComplexity'));
      return;
    }

    if (matchStatus === false) {
      setNewPasswordGeneralError(t('errorMismatchSubmit'));
      return;
    }

    const result = await updatePassword(formData);

    if (result?.error) {
      // result.error は共有Server Action（@gabby/lib）由来の日本語固定メッセージ
      if (result.error.includes('現在のパスワード') || result.error.includes('正しくありません')) {
        setCurrentPasswordError(result.error);
        setCurrentPassword('');
        showToast(t('toastUpdateFailed'), 'error');
      } else {
        setNewPasswordGeneralError(result.error);
        showToast(t('toastUpdateFailed'), 'error');
      }
    } else {
      showToast(t('toastUpdateSuccess'), 'success');
      router.push('/dashboard');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-100 border border-slate-100">
        <h1 className="text-xl font-bold text-slate-800 mb-6">{t('title')}</h1>

        <form action={handleSubmit} className="space-y-6">
          <div className="space-y-1">
            <PasswordInput
              label={t('currentPasswordLabel')}
              name="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            {currentPasswordError && (
              <p className="text-[11px] text-red-500 font-bold ml-1 animate-in fade-in">
                {currentPasswordError}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <PasswordInput
              label={t('newPasswordLabel')}
              name="newPassword"
              value={newPassword}
              required
              minLength={8}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setNewPasswordGeneralError(null);
              }}
            />
            {strengthStatus !== null && !strengthStatus && (
              <p className="text-[11px] text-red-500 font-bold ml-1 animate-in fade-in">
                {t('strengthHint')}
              </p>
            )}
          </div>

          <div className="relative">
            <PasswordInput
              label={t('confirmPasswordLabel')}
              name="confirmPassword"
              value={confirmPassword}
              required
              minLength={8}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setNewPasswordGeneralError(null);
              }}
            />

            {matchStatus !== null && (
              <p className={`text-[11px] font-bold mt-1 ml-1 flex items-center gap-1 animate-in fade-in ${
                matchStatus ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {matchStatus ? (
                  <><CheckCircle2 size={12} /> {t('matchSuccess')}</>
                ) : (
                  t('matchFail')
                )}
              </p>
            )}
          </div>

          {newPasswordGeneralError && (
            <p className="text-[11px] text-red-500 font-bold ml-1 animate-in fade-in slide-in-from-top-1">
              {newPasswordGeneralError}
            </p>
          )}

          <SubmitButton label={t('submitLabel')} loadingLabel={t('submitLoadingLabel')} />

          <Link
            href="/dashboard"
            className="text-xs text-slate-500 hover:text-brand flex items-center justify-center gap-1 transition-colors"
          >
            <ArrowLeft size={14} /> {t('backToDashboard')}
          </Link>
        </form>
      </div>
    </div>
  );
}
