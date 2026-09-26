import { CalendarDays, MessageSquareText, Mic, type LucideIcon } from 'lucide-react';
import type { TrainingLifetimeStats } from '@/actions/performanceAction';
import { HomeCard } from './HomeCard';

interface LifetimeStatsCardProps {
  stats: TrainingLifetimeStats | null;
  className?: string;
}

interface LifetimeStatItem {
  label: string;
  value: number;
  unit: string;
  icon: LucideIcon;
}

/**
 * これまでの積み上げ（通算の発話回数・フレーズ数・実施日数）。
 * カード幅が狭い（1列）ときは縦のリスト、広い（2列分）ときは横3列で表示する（コンテナクエリ）。
 */
export function LifetimeStatsCard({ stats, className }: LifetimeStatsCardProps) {
  const hasHistory = stats !== null && stats.total_active_days > 0;
  const items: LifetimeStatItem[] = [
    { label: '発話回数', value: stats?.total_assessments ?? 0, unit: '回', icon: Mic },
    { label: 'フレーズ', value: stats?.total_phrases ?? 0, unit: '件', icon: MessageSquareText },
    { label: '実施日数', value: stats?.total_active_days ?? 0, unit: '日', icon: CalendarDays },
  ];

  return (
    <HomeCard title="これまでの積み上げ" className={className}>
      {hasHistory ? (
        <div className="@container">
          <ul className="grid gap-2 @md:grid-cols-3">
            {items.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-3 rounded-control bg-canvas px-3 py-2.5 @md:flex-col @md:items-start @md:gap-2 @md:p-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand">
                  <item.icon size={16} />
                </span>
                <span className="flex-1 text-sm text-ink-muted">{item.label}</span>
                <span className="tabular-nums">
                  <span className="text-xl font-bold tracking-tight text-ink @md:text-3xl">{item.value.toLocaleString()}</span>
                  <span className="ml-0.5 text-xs text-ink-muted">{item.unit}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-ink-muted">
          トレーニングを始めると、これまでに話した回数やフレーズ数がここに積み上がっていきます。
        </p>
      )}
    </HomeCard>
  );
}
