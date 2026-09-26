import { Loader2 } from 'lucide-react';
import { cn } from '../../utils';
import { Skeleton } from './Skeleton';

/**
 * 画面の骨組みの型。
 * - list: 1列に並ぶ行（お知らせ・履歴・チャット一覧・フォーム等）
 * - cards: カードのグリッド（ダッシュボード・概要画面等）
 * - table: ツールバー＋表（管理画面の一覧等）
 */
export type PageSkeletonVariant = 'list' | 'cards' | 'table';

interface PageSkeletonProps {
  /** 支援技術向けの読み上げ文言（アプリの言語で渡す） */
  label: string;
  variant?: PageSkeletonVariant;
  /** 見出し（タイトル＋説明文）の骨組みを出すか */
  header?: boolean;
  className?: string;
}

function ListBody() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

function CardsBody() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {Array.from({ length: 4 }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

function TableBody() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg opacity-70" />
        ))}
      </div>
    </div>
  );
}

const BODY: Record<PageSkeletonVariant, () => React.ReactElement> = {
  list: ListBody,
  cards: CardsBody,
  table: TableBody,
};

/**
 * 画面遷移中（loading.tsx）の標準の骨組み。
 * 各アプリの loading.tsx から、アプリの言語の label を添えて使う。
 */
export function PageSkeleton({ label, variant = 'list', header = true, className }: PageSkeletonProps) {
  const Body = BODY[variant];
  return (
    <div role="status" aria-label={label} aria-busy className={cn('w-full space-y-6', className)}>
      {header && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      )}
      <Body />
    </div>
  );
}

/** カード1枚分の骨組み（Suspense の fallback 等、カード単位の遅延表示に使う） */
export function CardSkeleton({ className, rows = 3 }: { className?: string; rows?: number }) {
  return (
    <div aria-hidden className={cn('space-y-4 rounded-2xl border border-skeleton p-5', className)}>
      <Skeleton className="h-4 w-32" />
      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * 画面全体の読み込み表示（没入画面への遷移など、骨組みを描けない画面用）。
 * 親要素の高さいっぱいに中央寄せで表示する。
 */
export function LoadingScreen({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-busy className={cn('flex min-h-dvh w-full flex-col items-center justify-center gap-3 text-slate-500', className)}>
      <Loader2 className="size-8 animate-spin text-brand-500" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}
