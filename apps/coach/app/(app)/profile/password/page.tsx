// apps/coach/app/(app)/profile/password/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePassword } from '@/actions/coachAuthAction';
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
import { AUTH_LABELS } from '@/constants/auth';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

/**
 * Password change page (coach portal)
 * Lets the signed-in coach update their own password.
 */
export default function PasswordChangePage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState<NewPasswordValue>(EMPTY_NEW_PASSWORD);

  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);

  const { showToast } = useToast();
  const router = useRouter();

  const handleSubmit = async (formData: FormData) => {
    setCurrentPasswordError(null);

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
        setCurrentPassword('');
      } else {
        setNewPasswordError(result.error);
      }
      showToast('Failed to update password.', 'error');
    } else {
      showToast('Password updated successfully', 'success');
      router.push('/dashboard');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-100 border border-slate-100">
        <h1 className="text-xl font-bold text-slate-800 mb-6">Change Password</h1>

        <form action={handleSubmit} className="space-y-6">
          <div className="space-y-1">
            <PasswordInput
              label="Current password"
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
            labels={AUTH_LABELS.passwordFields}
            value={newPassword}
            onChange={(next) => {
              setNewPassword(next);
              setNewPasswordError(null);
            }}
            name="newPassword"
          />

          <FormError message={newPasswordError} />

          <SubmitButton label="Update Password" loadingLabel="Updating..." />

          <Link
            href="/dashboard"
            className="text-xs text-slate-500 hover:text-brand flex items-center justify-center gap-1 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
        </form>
      </div>
    </div>
  );
}
