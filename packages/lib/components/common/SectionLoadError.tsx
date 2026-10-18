'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, RotateCw } from 'lucide-react';
import { cn } from '../../utils';

interface SectionLoadErrorProps {
  /** 読み込めなかったことを伝える文言（アプリの言語で渡す） */
  message: string;
  /** 再読み込みのボタンの文言 */
  retryLabel: string;
  className?: string;
}

/**
 * 区画のデータを読み込めなかった時の表示（docs/CODING.md「画面のデータの取得」）。
 * 「0件」と見分けがつくように出し、再読み込みはサーバーで取り直す（router.refresh）。
 */
export function SectionLoadError({ message, retryLabel, className }: SectionLoadErrorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink-subtle/40 px-4 py-8 text-center',
        className,
      )}
    >
      <AlertCircle className="size-5 text-ink-subtle" aria-hidden />
      <p className="text-sm text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-black/5 disabled:opacity-50"
      >
        <RotateCw className={cn('size-4', isPending && 'animate-spin')} aria-hidden />
        {retryLabel}
      </button>
    </div>
  );
}
