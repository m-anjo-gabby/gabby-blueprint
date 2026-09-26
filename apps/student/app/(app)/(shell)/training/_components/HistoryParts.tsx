import { Calendar, type LucideIcon } from 'lucide-react';
import { getTrainingMetricConfig, type TrainingMetric } from '@gabby/lib/content/ui';
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

/** 履歴が0件の月の表示 */
export function HistoryEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
      <Calendar size={32} className="mx-auto mb-3 text-ink-subtle" />
      <p className="text-sm font-semibold text-ink-muted">{message}</p>
    </div>
  );
}
