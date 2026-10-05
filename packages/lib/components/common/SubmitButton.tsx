// packages/lib/components/common/SubmitButton.tsx
'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface SubmitButtonProps {
  label: string;
  /** 処理中に出す文言（省略時は label のまま） */
  loadingLabel?: string;
  /** 処理中かどうか。省略時は親フォームの送信状態（useFormStatus）を使う */
  pending?: boolean;
  /** ラベルの前に置くアイコン。処理中はスピナーに置き換わる */
  icon?: ReactNode;
  /** ラベルの後ろに置くアイコン（「次へ」の矢印等）。処理中は隠す */
  trailingIcon?: ReactNode;
  type?: 'submit' | 'button';
  onClick?: () => void;
  className?: string;
}

/**
 * 共通部品（packages/lib）用の主ボタン。処理中はスピナーを出して押せなくする。
 * アプリ内の画面では各アプリの `Button`（pending / icon）を使う。
 */
export function SubmitButton({
  label,
  loadingLabel,
  pending,
  icon,
  trailingIcon,
  type = 'submit',
  onClick,
  className = '',
}: SubmitButtonProps) {
  const { pending: formPending } = useFormStatus();
  const isPending = pending ?? formPending;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isPending}
      aria-busy={isPending || undefined}
      className={`w-full min-h-12 px-4 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0 ${
        isPending
          ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
          : 'bg-brand hover:bg-brand-strong text-white'
      } ${className}`}
    >
      {isPending ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {isPending ? (loadingLabel ?? label) : label}
      {!isPending && trailingIcon}
    </button>
  );
}
