// apps/admin/app/(app)/profile/password/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { updatePassword } from '@/actions/adminAuthAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { PasswordInput } from '@gabby/lib/components/common/PasswordInput';
import { SubmitButton } from '@gabby/lib/components/common/SubmitButton';
import { FormError } from '@gabby/lib/components/auth/AuthLayout';
import {
  EMPTY_NEW_PASSWORD,
  NewPasswordFields,
  validateNewPassword,
  type NewPasswordValue,
} from '@gabby/lib/components/auth/NewPasswordFields';
import { usePasswordFieldLabels } from '@/components/auth/useAuthLabels';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

/**
 * パスワード変更ページ（管理者ポータル）
 * ログイン中の管理者が自身のパスワードを更新するための画面
 */
export default function PasswordChangePage() {
  const t = useTranslations('profile.password');
  const passwordLabels = usePasswordFieldLabels();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState<NewPasswordValue>(EMPTY_NEW_PASSWORD);

  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);

  const { showToast } = useToast();
  const router = useRouter();

  const handleSubmit = async (formData: FormData) => {
    setCurrentPasswordError(null);

    const validationError = validateNewPassword(newPassword, passwordLabels);
    if (validationError) {
      setNewPasswordError(validationError);
      return;
    }
    setNewPasswordError(null);

    const result = await updatePassword(formData);

    if (result?.error) {
      // result.error は表示言語に合わせた文言。どの入力欄に出すかは errorCode で判定する
      if (result.errorCode === 'current_password_incorrect') {
        setCurrentPasswordError(result.error);
        setCurrentPassword('');
      } else {
        setNewPasswordError(result.error);
      }
      showToast(t('toastUpdateFailed'), 'error');
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
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            {currentPasswordError && (
              <p className="text-[11px] text-rose-600 font-bold ml-1">{currentPasswordError}</p>
            )}
          </div>

          <NewPasswordFields
            labels={passwordLabels}
            value={newPassword}
            onChange={(next) => {
              setNewPassword(next);
              setNewPasswordError(null);
            }}
            name="newPassword"
          />

          <FormError message={newPasswordError} />

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
