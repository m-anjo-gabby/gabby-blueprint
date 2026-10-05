import { getTrainingMetricConfig, type TrainingMetric } from '@gabby/lib/content/ui';
import { cn } from '@/lib/utils';

interface TrainingMetricIconProps {
  metric: TrainingMetric;
  size?: number;
  className?: string;
}

/** トレーニング指標のアイコン（アイコン・分類色は共通定義から取得） */
export function TrainingMetricIcon({ metric, size = 14, className }: TrainingMetricIconProps) {
  const { icon: Icon, theme } = getTrainingMetricConfig(metric);
  return <Icon size={size} className={cn('shrink-0', theme.iconText, className)} />;
}
