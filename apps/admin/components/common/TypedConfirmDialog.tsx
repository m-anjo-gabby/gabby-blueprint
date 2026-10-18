'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TypedConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** 消えるもの・残るものの説明（件数の表等） */
  children: ReactNode;
  /** 入力させる文字列（対象の名前）。一致するまで実行できない */
  expectedText: string;
  inputLabel: ReactNode;
  confirmLabel: ReactNode;
  pending: boolean;
  /** 実行できない理由・失敗の文言 */
  error?: string | null;
  /** 予行で中断の理由が分かった等、入力に関係なく実行できない */
  disabled?: boolean;
  onConfirm: () => void;
}

/**
 * 戻せない操作の確認。対象の名前を入力させてから実行する（DangerZone から開く）。
 */
export function TypedConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  expectedText,
  inputLabel,
  confirmLabel,
  pending,
  error,
  disabled,
  onConfirm,
}: TypedConfirmDialogProps) {
  const tCommon = useTranslations('common');
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const matched = typed.trim() !== '' && typed.trim() === expectedText.trim();

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next) setTyped('');
    onOpenChange(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-rose-700">{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-slate-600">{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor={inputId} className="text-xs font-bold text-slate-600">
            {inputLabel}
          </Label>
          <p className="select-all rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
            {expectedText}
          </p>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={pending || disabled}
          />
        </div>

        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{error}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{tCommon('cancel')}</AlertDialogCancel>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!matched || disabled}
            pending={pending}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
