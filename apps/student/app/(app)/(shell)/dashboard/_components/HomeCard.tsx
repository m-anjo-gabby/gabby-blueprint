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

/** ホーム画面の各カードの共通枠（見出し＋本文） */
export function HomeCard({ title, action, className, children }: HomeCardProps) {
  return (
    <section className={cn('rounded-card border border-line bg-surface p-5 sm:p-6 shadow-xs', className)}>
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
