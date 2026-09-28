'use client';

import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { PasswordInput } from '../common/PasswordInput';
import { getPasswordStrengthErrorCode } from '../../auth/validation';
import type { PasswordFieldLabels } from './types';

export interface NewPasswordValue {
  password: string;
  confirm: string;
}

export const EMPTY_NEW_PASSWORD: NewPasswordValue = { password: '', confirm: '' };

/**
 * 送信前のチェック（8文字以上・英数混在・確認用と一致）。問題があれば表示する文言を返す。
 * 条件の正本は `getPasswordStrengthErrorCode`（サーバー側の検証と共通）。
 */
export function validateNewPassword(value: NewPasswordValue, labels: PasswordFieldLabels): string | null {
  const code = getPasswordStrengthErrorCode(value.password);
  if (code === 'password_too_short') return labels.tooShort;
  if (code === 'password_needs_alnum') return labels.needsAlnum;
  if (value.password !== value.confirm) return labels.mismatch;
  return null;
}

const TONE_CLASS = {
  hint: 'text-slate-500',
  error: 'text-rose-600 font-bold',
  success: 'text-emerald-600 font-bold',
} as const;

function FieldMessage({ tone, children }: { tone: keyof typeof TONE_CLASS; children: ReactNode }) {
  return <p className={`ml-1 mt-1 flex items-center gap-1 text-[11px] ${TONE_CLASS[tone]}`}>{children}</p>;
}

interface NewPasswordFieldsProps {
  labels: PasswordFieldLabels;
  value: NewPasswordValue;
  onChange: (value: NewPasswordValue) => void;
  /** 新パスワード欄の name（サーバーアクションが読む名前） */
  name?: string;
  confirmName?: string;
}

/** 新しいパスワード＋確認用の入力欄（条件と一致状況をリアルタイムに表示） */
export function NewPasswordFields({
  labels,
  value,
  onChange,
  name = 'password',
  confirmName = 'confirmPassword',
}: NewPasswordFieldsProps) {
  const strengthCode = value.password ? getPasswordStrengthErrorCode(value.password) : null;
  const matches = value.password && value.confirm ? value.password === value.confirm : null;

  return (
    <div className="space-y-4">
      <div>
        <PasswordInput
          label={labels.newPassword}
          name={name}
          autoComplete="new-password"
          value={value.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
          required
          minLength={8}
        />
        {strengthCode === 'password_needs_alnum' ? (
          <FieldMessage tone="error">{labels.needsAlnum}</FieldMessage>
        ) : (
          <FieldMessage tone="hint">{labels.requirement}</FieldMessage>
        )}
      </div>

      <div>
        <PasswordInput
          label={labels.confirmPassword}
          name={confirmName}
          autoComplete="new-password"
          value={value.confirm}
          onChange={(e) => onChange({ ...value, confirm: e.target.value })}
          required
          minLength={8}
        />
        {matches !== null && (
          <FieldMessage tone={matches ? 'success' : 'error'}>
            {matches ? (
              <>
                <CheckCircle2 size={12} aria-hidden /> {labels.match}
              </>
            ) : (
              labels.mismatch
            )}
          </FieldMessage>
        )}
      </div>
    </div>
  );
}
