'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShellPanelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * アプリシェル内のパネル型画面の本体。
 * モバイルは画面いっぱいの平面、sm以上は枠線付きの落ち着いたパネルとして表示する
 * （影を重ねた「浮いたカード」表現はシェルのナビと競合するため使わない）。
 */
export function ShellPanel({ children, className }: ShellPanelProps) {
  return (
    <div
      className={cn(
        'flex h-full w-full max-w-2xl flex-col overflow-hidden bg-surface sm:rounded-panel sm:border sm:border-line sm:shadow-xs',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * 戻る先の指定。
 * - string: 固定の遷移先（タブ配下の親画面など）
 * - { history: fallbackHref }: 直前の画面へ戻る（通知・お知らせ等、複数の画面から来る場合）。
 *   履歴が無い（メールのリンクから直接開いた等）場合は fallbackHref へ遷移する
 */
export type ShellPanelBack = string | { history: string };

interface ShellPanelHeaderProps {
  title: string;
  description?: React.ReactNode;
  back?: ShellPanelBack;
  /** 見出し右側に置く要素（件数バッジなど） */
  aside?: React.ReactNode;
  /** 見出しの下に置く要素（検索・タブなど） */
  children?: React.ReactNode;
}

const BACK_BUTTON_CLASS =
  '-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-slate-100 hover:text-ink active:scale-95 transition-all';

function BackButton({ back }: { back: ShellPanelBack }) {
  const router = useRouter();

  if (typeof back === 'string') {
    return (
      <Link href={back} aria-label="戻る" className={BACK_BUTTON_CLASS}>
        <ChevronLeft size={22} />
      </Link>
    );
  }

  const handleBack = () => {
    if (window.history.length > 1) router.back();
    else router.push(back.history);
  };

  return (
    <button type="button" onClick={handleBack} aria-label="戻る" className={BACK_BUTTON_CLASS}>
      <ChevronLeft size={22} />
    </button>
  );
}

/** パネル型画面の共通ヘッダー（戻る・見出し・説明・補助要素） */
export function ShellPanelHeader({ title, description, back, aside, children }: ShellPanelHeaderProps) {
  return (
    <header className="shrink-0 space-y-4 border-b border-line/70 px-5 pt-5 pb-4 sm:px-8 sm:pt-7 sm:pb-5">
      <div className="flex items-center gap-2">
        {back && <BackButton back={back} />}
        <h1 className="min-w-0 flex-1 truncate text-xl sm:text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {aside}
      </div>
      {description && <p className="text-sm leading-relaxed text-ink-muted">{description}</p>}
      {children}
    </header>
  );
}

/** 見出し右側の件数表示（例: 「12件」） */
export function CountBadge({ count, unit = '件' }: { count: number; unit?: string }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-soft">
      {count}
      <span className="ml-0.5 font-normal text-ink-muted">{unit}</span>
    </span>
  );
}
