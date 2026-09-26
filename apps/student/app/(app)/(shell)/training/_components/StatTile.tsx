import type { LucideIcon } from 'lucide-react';
import { getTrainingMetricConfig, type TrainingMetric } from '@gabby/lib/content/ui';
import { cn } from '@/lib/utils';

type StatTileProps = {
  label: string;
  value: number;
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
      <p className="mt-3 flex items-baseline gap-1 tabular-nums">
        <span className={cn('font-bold tracking-tight text-ink', emphasis ? 'text-3xl sm:text-4xl' : 'text-2xl')}>{value}</span>
        <span className="text-sm text-ink-muted">{unit}</span>
      </p>
    </div>
  );
}
