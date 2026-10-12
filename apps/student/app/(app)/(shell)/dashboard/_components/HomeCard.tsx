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
  /** 2列分のカード（ご契約プランと並ぶ「これまでの歩み」、グループセッションと並ぶライブセッション） */
  wide: 'lg:col-span-2',
  /** 1行を占めるカード（ライブセッションが無い場合のグループセッション、ご契約プランが無い場合の「これまでの歩み」） */
  fullRow: 'lg:col-span-3',
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

const PROGRESS_TONES = {
  brand: { track: 'h-1.5 bg-canvas', bar: 'bg-brand' },
  /** ブランドのグラデーション面の上 */
  light: { track: 'h-1.5 bg-white/25', bar: 'bg-white' },
  /** 淡い下地（canvas）の上に置く補助的な進捗（節目までの進み具合等） */
  subtle: { track: 'h-1 bg-line', bar: 'bg-brand-500' },
} as const;

/** カード内で使う細い進捗バー */
export function ProgressBar({ percent, tone = 'brand' }: { percent: number; tone?: keyof typeof PROGRESS_TONES }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const { track, bar } = PROGRESS_TONES[tone];
  return (
    <div className={cn('w-full overflow-hidden rounded-full', track)}>
      <div className={cn('h-full rounded-full transition-[width] duration-700', bar)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/**
 * 主役カード（ブランドのグラデーション面）の背景の装飾。本番と骨組みで共有する。
 * 右下から広がる同心円（発話の広がり）を白で薄く重ね、右上に明るい青の光を置いて奥行きを出す。
 * 親は relative + overflow-hidden、手前の中身は relative にする。
 */
export function HeroBackdrop() {
  return (
    <>
      <svg
        aria-hidden
        viewBox="0 0 560 560"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        className="pointer-events-none absolute -right-37.5 -bottom-57.5 size-140 text-white opacity-12"
      >
        {[56, 96, 136, 176, 216, 256].map((r) => (
          <circle key={r} cx={280} cy={280} r={r} />
        ))}
      </svg>
      <div className="pointer-events-none absolute -top-30 right-20 size-70 rounded-full bg-brand-400/35 blur-3xl" />
    </>
  );
}
