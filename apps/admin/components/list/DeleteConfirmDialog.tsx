'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteConfirmDialogProps<T> {
  /** 削除の対象（null で閉じる） */
  target: T | null;
  onClose: () => void;
  onConfirm: (target: T) => void;
  title: ReactNode;
  /** 対象ごとの説明（対象名を太字にする等） */
  description: (target: T) => ReactNode;
  confirmLabel: ReactNode;
}

/** 一覧の行の削除の確認。行の削除ボタンで target を渡して開く */
export function DeleteConfirmDialog<T>({
  target,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
}: DeleteConfirmDialogProps<T>) {
  const tCommon = useTranslations('common');
  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{target !== null && description(target)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => target !== null && onConfirm(target)}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 削除の説明文の中で対象名を太字にする（t.rich の bold 用） */
export const boldChunks = (chunks: ReactNode) => <span className="font-bold text-slate-900">{chunks}</span>;
