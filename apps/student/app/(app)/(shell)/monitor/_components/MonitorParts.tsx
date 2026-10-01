import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toDayLabel } from './monitorQuery';

/** 履歴一覧の1ページあたりの日数 */
export const MONITOR_DAYS_PER_PAGE = 7;

/** モニター用アカウントであることを示す小さなラベル */
export function MonitorAccountBadge() {
  return (
    <span className="shrink-0 rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
      モニター
    </span>
  );
}

/** 受講生名（モニター用アカウントにはラベルを付ける） */
export function MonitorUserName({ name, isMonitor, className }: { name: string | null; isMonitor: boolean; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <span className="truncate font-semibold text-ink">{name || '未設定'}</span>
      {isMonitor && <MonitorAccountBadge />}
    </span>
  );
}

interface MonitorPagerProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** 日付単位のページ送り（2ページ以上ある場合だけ表示する） */
export function MonitorPager({ page, totalPages, onPageChange }: MonitorPagerProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="inline-flex items-center rounded-control border border-line bg-surface p-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="前のページ"
        className="h-9 w-9 rounded-control text-ink-muted hover:bg-brand-soft hover:text-brand"
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-14 text-center text-sm font-semibold text-ink tabular-nums">
        {page}
        <span className="mx-0.5 font-normal text-ink-muted">/</span>
        {totalPages}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="次のページ"
        className="h-9 w-9 rounded-control text-ink-muted hover:bg-brand-soft hover:text-brand"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

interface MonitorDayCardProps {
  /** YYYY-MM-DD */
  date: string;
  /** 日付の横に並べるその日の合計（HistoryMetric） */
  metrics: React.ReactNode;
  children: React.ReactNode;
}

/** 日付ごとの履歴カード（見出しにその日の合計、中に受講生・教材ごとの行） */
export function MonitorDayCard({ date, metrics, children }: MonitorDayCardProps) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-line bg-canvas px-4 py-3 sm:px-5">
        <h3 className="text-base font-bold text-ink tabular-nums">{toDayLabel(date)}</h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{metrics}</div>
      </header>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  );
}

/** 履歴カードの1行（受講生・教材・実績）。md 以上では3列に揃える */
export function MonitorDayRow({ user, content, metrics }: { user: React.ReactNode; content: React.ReactNode; metrics: React.ReactNode }) {
  return (
    <li className="grid grid-cols-1 gap-1.5 px-4 py-3 text-sm md:grid-cols-12 md:items-center md:gap-4 sm:px-5">
      <div className="min-w-0 md:col-span-3">{user}</div>
      <div className="min-w-0 md:col-span-4">{content}</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 md:col-span-5">{metrics}</div>
    </li>
  );
}

const DAY_SKELETON_COUNT = 3;
const ROW_SKELETON_COUNT = 3;

/** 日付ごとの履歴カードの骨組み */
export function MonitorDayListSkeleton() {
  return (
    <>
      {Array.from({ length: DAY_SKELETON_COUNT }, (_, i) => (
        <div key={i} aria-hidden className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex h-12.5 items-center justify-between gap-4 border-b border-line bg-canvas px-4 sm:px-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3.5 w-40" />
          </div>
          <div className="divide-y divide-line">
            {Array.from({ length: ROW_SKELETON_COUNT }, (_, j) => (
              <div key={j} className="flex h-11.5 items-center gap-6 px-4 sm:px-5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
