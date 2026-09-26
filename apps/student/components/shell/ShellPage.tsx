'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

/**
 * 戻る先の指定。
 * - string: 固定の遷移先（タブ配下の親画面など）
 * - { history: fallbackHref }: 直前の画面へ戻る（通知・お知らせ等、複数の画面から来る場合）。
 *   履歴が無い（メールのリンクから直接開いた等）場合は fallbackHref へ遷移する
 */
export type ShellPageBack = string | { history: string };

interface ShellPageHeaderProps {
  title: string;
  description?: React.ReactNode;
  back?: ShellPageBack;
  /** 見出し右側に置く要素（件数バッジ・操作ボタンなど） */
  aside?: React.ReactNode;
  /**
   * 見出しの下に置くツールバー（検索・タブ・月切替など）。
   * ページをスクロールしても画面上部に固定表示される。
   */
  children?: React.ReactNode;
}

const BACK_BUTTON_CLASS =
  '-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface hover:text-ink active:scale-95 transition-all';

function BackButton({ back }: { back: ShellPageBack }) {
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

/**
 * アプリシェル内の画面の共通ヘッダー（戻る・見出し・説明・補助要素・固定ツールバー）。
 * 画面の枠は各 layout.tsx の ContentFrame が担い、スクロールはシェルの <main> に任せる
 * （画面内に「スマホ型の浮いたパネル」を作らない）。
 */
export function ShellPageHeader({ title, description, back, aside, children }: ShellPageHeaderProps) {
  return (
    <>
      <header className="space-y-1.5 pb-4 sm:pb-5">
        <div className="flex items-center gap-2">
          {back && <BackButton back={back} />}
          <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
          {aside}
        </div>
        {description && <p className="text-sm leading-relaxed text-ink-muted">{description}</p>}
      </header>

      {children && (
        // ContentFrame の左右余白を打ち消して背景を端まで敷き、スクロール中の一覧を隠す
        <div className="sticky top-0 z-20 -mx-4 mb-4 space-y-3 bg-canvas/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
          {children}
        </div>
      )}
    </>
  );
}

/** 見出し右側の件数表示（例: 「12件」） */
export function CountBadge({ count, unit = '件' }: { count: number; unit?: string }) {
  return (
    <span className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-soft">
      {count}
      <span className="ml-0.5 font-normal text-ink-muted">{unit}</span>
    </span>
  );
}

/** 画面内の区切り見出し（例: 「今月のまとめ」） */
export function ShellSectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold text-ink">{children}</h2>
      {aside}
    </div>
  );
}
