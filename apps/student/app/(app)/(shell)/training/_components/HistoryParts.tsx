import { Calendar, type LucideIcon } from 'lucide-react';
import { getTrainingMetricConfig, type TrainingMetric } from '@gabby/lib/content/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type HistoryMetricProps = { label: string; value: number | string } & (
  /** 分類のある指標：アイコンと分類色を共通定義から取得する */
  | { metric: TrainingMetric; icon?: never }
  /** 分類でない指標（制限時間・回答数等）：控えめなグレーで表示する */
  | { metric?: never; icon: LucideIcon }
);

/** 履歴一覧の小さな数値表示（アイコン・ラベル・数値） */
export function HistoryMetric({ metric, icon, label, value }: HistoryMetricProps) {
  const config = metric ? getTrainingMetricConfig(metric) : null;
  const Icon = config?.icon ?? icon;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
      {Icon && <Icon size={14} className={cn('shrink-0', config?.theme.iconText ?? 'text-ink-subtle')} />}
      {label}
      <span className="font-semibold text-ink tabular-nums">{value}</span>
    </span>
  );
}

const DAY_SKELETON_COUNT = 4;

/**
 * 日付ごとの履歴カード（閉じた状態: 日付・指標の行・開閉アイコン）の骨組み。
 * 履歴一覧の `space-y-3` の中に置く。metricCount は日付の下に並ぶ指標の数
 */
export function HistoryDayListSkeleton({ metricCount }: { metricCount: number }) {
  return (
    <>
      {Array.from({ length: DAY_SKELETON_COUNT }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <div className="flex h-6 items-center">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="mt-1.5 flex h-5 items-center gap-4">
              {Array.from({ length: metricCount }, (_, j) => (
                <Skeleton key={j} className="h-3.5 w-16" />
              ))}
            </div>
          </div>
          <Skeleton className="size-4.5 shrink-0 rounded-sm" />
        </div>
      ))}
    </>
  );
}

/** 履歴が0件の月の表示 */
export function HistoryEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
      <Calendar size={32} className="mx-auto mb-3 text-ink-subtle" />
      <p className="text-sm font-semibold text-ink-muted">{message}</p>
    </div>
  );
}
