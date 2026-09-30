// apps/student/app/(app)/(shell)/profile/password/page.tsx
'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { updatePassword } from '@/actions/authAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { PasswordInput } from '@gabby/lib/components/common/PasswordInput';
import {
  EMPTY_NEW_PASSWORD,
  NewPasswordFields,
  validateNewPassword,
  type NewPasswordValue,
} from '@gabby/lib/components/auth/NewPasswordFields';
import { Button } from '@/components/ui/button';
import { AUTH_LABELS } from '@/constants/auth';
import { ProfileSection } from '../_components/ProfileSection';
import { PasswordPageHeader } from '../_components/ProfileParts';

/**
 * パスワード変更ページ
 * ログインユーザーが自身のパスワードを更新するための画面
 */
export default function PasswordChangePage() {
  // 入力値はステートで管理し、エラー時も入力を保持
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState<NewPasswordValue>(EMPTY_NEW_PASSWORD);

  // 現在のパスワード誤りは現在のパスワード欄の直下、それ以外は新しいパスワードのエラーとして表示する
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);

  const { showToast } = useToast();
  const router = useRouter();

  const handleSubmit = async (formData: FormData) => {
    setCurrentPasswordError(null);

    // サーバー送信前のチェック（8文字以上・英数混在・確認用と一致）
    const validationError = validateNewPassword(newPassword, AUTH_LABELS.passwordFields);
    if (validationError) {
      setNewPasswordError(validationError);
      return;
    }
    setNewPasswordError(null);

    const result = await updatePassword(formData);

    if (result?.error) {
      if (result.errorCode === 'current_password_incorrect') {
        setCurrentPasswordError(result.error);
        setCurrentPassword(''); // 問題箇所のみクリア
      } else {
        // 漏洩パスワード・現在と同じパスワード等のサーバー側の判定
        setNewPasswordError(result.error);
      }
      showToast('パスワードの更新に失敗しました。', 'error');
    } else {
      showToast('パスワードを正常に更新しました', 'success');
      router.push('/profile');
    }
  };

  return (
    <div className="pb-10">
      <PasswordPageHeader />

      <ProfileSection>
        <form action={handleSubmit} className="space-y-6">
          <div className="space-y-1">
            <PasswordInput
              label="現在のパスワード"
              name="currentPassword"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            {currentPasswordError && (
              <p className="ml-1 text-[11px] font-bold text-rose-600 animate-in fade-in">{currentPasswordError}</p>
            )}
          </div>

          <NewPasswordFields
            labels={AUTH_LABELS.passwordFields}
            value={newPassword}
            onChange={(next) => {
              setNewPassword(next);
              setNewPasswordError(null); // 入力し直したらエラーを消す
            }}
            name="newPassword"
          />

          {newPasswordError && (
            <p className="rounded-control border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600 animate-in fade-in">
              {newPasswordError}
            </p>
          )}

          <div className="flex justify-end pt-2">
            <PasswordSubmitButton />
          </div>
        </form>
      </ProfileSection>
    </div>
  );
}

/** 送信ボタン（useFormStatus で送信中を検知して pending 表示） */
function PasswordSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      pending={pending}
      icon={<KeyRound />}
      className="h-11 w-full rounded-control bg-brand px-6 font-bold text-white hover:bg-brand-strong sm:w-auto"
    >
      {pending ? '更新中...' : 'パスワードを更新'}
    </Button>
  );
}
