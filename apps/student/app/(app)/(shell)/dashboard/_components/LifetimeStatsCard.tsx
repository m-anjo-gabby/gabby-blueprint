import { Award, CalendarDays, type LucideIcon } from 'lucide-react';
import { getTrainingMetricConfig } from '@gabby/lib/content/ui';
import type { TrainingLifetimeStats } from '@/actions/performanceAction';
import {
  ACTIVE_DAY_MILESTONES,
  COUNT_MILESTONES,
  isReachedThisWeek,
  resolveMilestone,
  type Milestone,
} from '../_lib/milestones';
import { HomeCard, ProgressBar } from './HomeCard';

/** 今週増えた分（節目の達成バッジの判定に使う） */
export interface LifetimeWeekGains {
  activeDays: number;
  assessments: number;
  phrases: number;
}

interface LifetimeStatsCardProps {
  stats: TrainingLifetimeStats | null;
  /** 今週増えた分。現在時刻の確定前（今週が決まらない間）は null で、達成バッジを出さない */
  weekGains: LifetimeWeekGains | null;
  className?: string;
}

interface LifetimeStatItem {
  label: string;
  value: number;
  weekGain: number;
  unit: string;
  icon: LucideIcon;
  /** アイコンのマスの色（分類のある指標は分類色、実施日数はブランド色） */
  iconTile: string;
  milestones: readonly number[];
}

const SPEECH = getTrainingMetricConfig('speech');
const PHRASE = getTrainingMetricConfig('phrase');

/** 今週達成した節目のバッジ（ゴールドは達成の演出に限って少量使う） */
function MilestoneBadge({ milestone, unit }: { milestone: Milestone; unit: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gold bg-gold-soft px-2 py-0.5 text-[11px] font-bold text-brand-deep">
      <Award size={12} className="fill-gold" />
      {milestone.reached.toLocaleString()}
      {unit}達成
    </span>
  );
}

/**
 * これまでの歩み（通算の発話回数・フレーズ数・実施日数）と、それぞれの次の節目までの進み具合。
 * 節目は値が増えるほど間隔が広がる（`_lib/milestones.ts`）。今週のうちに越えた節目には達成バッジを付ける。
 * カード幅が狭い（1列）ときは「アイコン・項目名・数値」の行の下に節目、
 * 広い（2列分）ときは横3列で、各マスを「アイコン＋項目名」「大きな数値」「節目」の3段にする（コンテナクエリ）。
 */
export function LifetimeStatsCard({ stats, weekGains, className }: LifetimeStatsCardProps) {
  const hasHistory = stats !== null && stats.total_active_days > 0;
  const items: LifetimeStatItem[] = [
    {
      label: '発話回数',
      value: stats?.total_assessments ?? 0,
      weekGain: weekGains?.assessments ?? 0,
      unit: '回',
      icon: SPEECH.icon,
      iconTile: SPEECH.theme.iconTile,
      milestones: COUNT_MILESTONES,
    },
    {
      label: 'フレーズ',
      value: stats?.total_phrases ?? 0,
      weekGain: weekGains?.phrases ?? 0,
      unit: '件',
      icon: PHRASE.icon,
      iconTile: PHRASE.theme.iconTile,
      milestones: COUNT_MILESTONES,
    },
    {
      label: '実施日数',
      value: stats?.total_active_days ?? 0,
      weekGain: weekGains?.activeDays ?? 0,
      unit: '日',
      icon: CalendarDays,
      iconTile: 'bg-brand-soft text-brand',
      milestones: ACTIVE_DAY_MILESTONES,
    },
  ];

  return (
    <HomeCard title="これまでの歩み" className={className}>
      {hasHistory ? (
        <div className="@container">
          <ul className="grid gap-2 @md:grid-cols-3">
            {items.map((item) => {
              const milestone = resolveMilestone(item.value, item.milestones);
              return (
                <li
                  key={item.label}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-canvas px-3 py-2.5 @md:gap-x-2.5 @md:p-4"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control ${item.iconTile}`}>
                    <item.icon size={16} />
                  </span>
                  <span className="flex-1 text-sm text-ink-muted">{item.label}</span>
                  {weekGains && isReachedThisWeek(item.value, item.weekGain, milestone) && (
                    <MilestoneBadge milestone={milestone} unit={item.unit} />
                  )}
                  <span className="tabular-nums @md:w-full">
                    <span className="text-xl font-bold tracking-tight text-ink @md:text-3xl">{item.value.toLocaleString()}</span>
                    <span className="ml-0.5 text-xs text-ink-muted">{item.unit}</span>
                  </span>
                  <div className="w-full space-y-1.5">
                    <ProgressBar percent={milestone.progressPercent} tone="subtle" />
                    <p className="text-xs text-ink-muted tabular-nums">
                      {milestone.next.toLocaleString()}
                      {item.unit}まで あと{milestone.remaining.toLocaleString()}
                      {item.unit}
                    </p>
                  </div>
                </li>
              );
            })}
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
