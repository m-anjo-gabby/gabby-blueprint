import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HomeCardProps {
  title: string;
  /** 見出し右側の補助リンク（例: 「すべて見る」） */
  action?: { label: string; href: string };
  className?: string;
  children: React.ReactNode;
}

/**
 * ホーム画面の外形（HomeView と読み込み中の HomeSkeleton で共有し、骨組み→本番で形がずれないようにする）。
 * PCで横に並ぶカードは行ごとに高さを揃える（各カードは h-full で行の高さいっぱいに広がる）。
 * モバイルも grid-cols-1（minmax(0,1fr)）を明示する。暗黙の列は中身の最小幅まで広がるため、
 * truncate した長いコーチ名・課題名が省略前の幅で列を押し広げ、画面外へはみ出してしまう
 */
export const HOME_LAYOUT = {
  page: 'space-y-6 pb-6',
  header: 'space-y-1 px-1',
  grid: 'grid grid-cols-1 gap-4 lg:grid-cols-3',
  /** 主役カード「今日やること」の区画 */
  focus: 'lg:col-span-2',
} as const;

/** ホーム画面の各カードの共通枠（見出し＋本文）。グリッドの行の高さに合わせて伸びる */
export function HomeCard({ title, action, className, children }: HomeCardProps) {
  return (
    <section className={cn('h-full rounded-card border border-line bg-surface p-5 sm:p-6 shadow-xs', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-strong hover:text-brand-900 transition-colors"
          >
            {action.label}
            <ChevronRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** カード内で使う細い進捗バー */
export function ProgressBar({ percent, tone = 'brand' }: { percent: number; tone?: 'brand' | 'light' }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full', tone === 'light' ? 'bg-white/25' : 'bg-slate-100')}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-700', tone === 'light' ? 'bg-white' : 'bg-brand')}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
