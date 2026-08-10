// apps/admin/app/(app)/profile/password/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
      setNewPasswordGeneralError('新しいパスワードは8文字以上で入力してください。');
      return;
    }

    if (strengthStatus === false) {
      setNewPasswordGeneralError('パスワードには英字と数字を両方含めてください。');
      return;
    }

    if (matchStatus === false) {
      setNewPasswordGeneralError('新しいパスワードが一致していません。');
      return;
    }

    const result = await updatePassword(formData);

    if (result?.error) {
      if (result.error.includes('現在のパスワード') || result.error.includes('正しくありません')) {
        setCurrentPasswordError(result.error);
        setCurrentPassword('');
        showToast('パスワードの更新に失敗しました。', 'error');
      } else {
        setNewPasswordGeneralError(result.error);
        showToast('パスワードの更新に失敗しました。', 'error');
      }
    } else {
      showToast('パスワードを正常に更新しました', 'success');
      router.push('/dashboard');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-100 border border-slate-100">
        <h1 className="text-xl font-bold text-slate-800 mb-6">パスワード変更</h1>

        <form action={handleSubmit} className="space-y-6">
          <div className="space-y-1">
            <PasswordInput
              label="現在のパスワード"
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
              label="新しいパスワード"
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
                英字と数字を両方含めてください
              </p>
            )}
          </div>

          <div className="relative">
            <PasswordInput
              label="新しいパスワード（確認用）"
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
                  <><CheckCircle2 size={12} /> パスワードが一致しました</>
                ) : (
                  'パスワードが一致していません'
                )}
              </p>
            )}
          </div>

          {newPasswordGeneralError && (
            <p className="text-[11px] text-red-500 font-bold ml-1 animate-in fade-in slide-in-from-top-1">
              {newPasswordGeneralError}
            </p>
          )}

          <SubmitButton label="パスワードを更新" loadingLabel="更新中..." />

          <Link
            href="/dashboard"
            className="text-xs text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1 transition-colors"
          >
            <ArrowLeft size={14} /> ダッシュボードに戻る
          </Link>
        </form>
      </div>
    </div>
  );
}
