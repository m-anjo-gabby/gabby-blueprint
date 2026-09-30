import type { LucideIcon } from 'lucide-react';
import { getTrainingMetricConfig, type TrainingMetric } from '@gabby/lib/content/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type StatTileProps = {
  label: string;
  /** null は読み込み中（数値の位置に骨組みを出す） */
  value: number | null;
  unit: string;
  /** 主要指標として大きく表示する */
  emphasis?: boolean;
} & (
  /** 分類のある指標：アイコンと分類色を共通定義から取得する */
  | { metric: TrainingMetric; icon?: never }
  /** 分類でない指標（実施日数等）：ブランド色で表示する */
  | { metric?: never; icon: LucideIcon }
);

/** トレーニング記録の数値表示（ラベル・数値・単位） */
export function StatTile({ label, value, unit, metric, icon, emphasis = false }: StatTileProps) {
  const config = metric ? getTrainingMetricConfig(metric) : null;
  const Icon = config?.icon ?? icon;
  const iconTile = config?.theme.iconTile ?? 'bg-brand-soft text-brand';

  return (
    <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
      {/* 狭い画面（3列表示等）ではラベルが折り返さないよう、アイコンをラベルの上に置く */}
      <div className="flex flex-col items-start gap-2 text-sm font-medium text-ink-muted sm:flex-row sm:items-center">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-control', iconTile)}>
          {Icon && <Icon size={16} />}
        </span>
        {label}
      </div>
      {value === null ? (
        // 数値の行（text-3xl / sm:text-4xl / text-2xl）と同じ高さの骨組み
        <div className={cn('mt-3 flex items-center', emphasis ? 'h-9 sm:h-10' : 'h-8')}>
          <Skeleton className={cn('w-14', emphasis ? 'h-7 sm:h-8' : 'h-6')} />
        </div>
      ) : (
        <p className="mt-3 flex items-baseline gap-1 tabular-nums">
          <span className={cn('font-bold tracking-tight text-ink', emphasis ? 'text-3xl sm:text-4xl' : 'text-2xl')}>{value}</span>
          <span className="text-sm text-ink-muted">{unit}</span>
        </p>
      )}
    </div>
  );
}
