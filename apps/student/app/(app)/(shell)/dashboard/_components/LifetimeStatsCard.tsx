import { Award, CalendarDays, type LucideIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getTrainingMetricConfig } from '@gabby/lib/content/ui';
import type { TrainingLifetimeStats } from '@/actions/performanceAction';
import { cn } from '@/lib/utils';
import {
  ACTIVE_DAY_MILESTONES,
  ASSESSMENT_MILESTONES,
  getActiveDayMilestoneLabel,
  isReachedThisWeek,
  resolveMilestone,
  resolveMilestoneSteps,
  type Milestone,
  type MilestoneStep,
} from '../_lib/milestones';
import { HomeCard, ProgressBar } from './HomeCard';

/** 今週増えた分（節目の到達バッジの判定に使う） */
export interface LifetimeWeekGains {
  activeDays: number;
  assessments: number;
}

interface LifetimeStatsCardProps {
  stats: TrainingLifetimeStats | null;
  /** 今週増えた分。現在時刻の確定前（今週が決まらない間）は null で、到達バッジを出さない */
  weekGains: LifetimeWeekGains | null;
  className?: string;
}

/**
 * カードの中の並び（本番と骨組みで共有する）。
 * カード幅が広い（2列分・タブレット）ときは実施日数を主役に横並び、狭い（1列・スマホ）ときは縦に積む（コンテナクエリ）。
 */
export const LIFETIME_LAYOUT = {
  grid: 'grid gap-3 @lg:grid-cols-5',
  main: '@lg:col-span-3',
  sub: '@lg:col-span-2',
} as const;

/** 段階表示に並べる節目の数 */
const LADDER_SIZE = 6;

const SPEECH = getTrainingMetricConfig('speech');

/** 各項目の見出し（アイコン・項目名）。実施日数は分類のない指標のためブランド色、発話評価は分類色 */
export const LIFETIME_ITEMS = {
  activeDays: { label: '実施日数', unit: '日', icon: CalendarDays, iconTile: 'bg-brand-soft text-brand' },
  assessments: {
    label: '発話評価',
    unit: '回',
    icon: SPEECH.icon,
    iconTile: SPEECH.theme.iconTile,
    caption: '評価を受けた発話の数',
  },
} as const;

interface LifetimeBlockProps {
  icon: LucideIcon;
  iconTile: string;
  label: string;
  badge?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** 項目1つの枠（アイコン・項目名・到達バッジ＋中身）。本番と骨組みで共有する */
export function LifetimeBlock({ icon: Icon, iconTile, label, badge, className, children }: LifetimeBlockProps) {
  return (
    <section className={cn('flex flex-col rounded-control bg-canvas p-4', className)}>
      <div className="flex items-center gap-2.5">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-control', iconTile)}>
          <Icon size={16} />
        </span>
        <h3 className="flex-1 text-sm text-ink-muted">{label}</h3>
        {badge}
      </div>
      {children}
    </section>
  );
}

/** 大きな数値＋単位（text-3xl の1行 = h-9） */
function BigValue({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="tabular-nums">
      <span className="text-3xl font-bold tracking-tight text-ink">{value.toLocaleString()}</span>
      <span className="ml-0.5 text-xs text-ink-muted">{unit}</span>
    </span>
  );
}

/** 今週到達した節目のバッジ（ゴールドは達成の演出に限って少量使う） */
function MilestoneBadge({ milestone, unit }: { milestone: Milestone; unit: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gold bg-gold-soft px-2 py-0.5 text-[11px] font-bold text-brand-deep">
      <Award size={12} className="fill-gold" />
      {milestone.reached.toLocaleString()}
      {unit}に到達
    </span>
  );
}

const STEP_DOT: Record<MilestoneStep['state'], string> = {
  reached: 'size-2.5 bg-brand-500',
  next: 'size-4 border-2 border-brand-500 bg-surface',
  upcoming: 'size-3 border-2 border-line bg-surface',
};

const STEP_STATE_LABEL: Record<MilestoneStep['state'], string> = {
  reached: '到達済み',
  next: '次の節目',
  upcoming: '',
};

/**
 * 節目の段階表示（点を線でつなぎ、到達済みの節目を塗る）。高さは点の行（h-4）＋間隔＋数値の行（h-4）で固定。
 * 次の節目へ向かう区間は、直近の節目からの進み具合の分だけ線を伸ばす。
 */
function MilestoneLadder({ steps, progressPercent, unit }: { steps: MilestoneStep[]; progressPercent: number; unit: string }) {
  const count = steps.length;
  const nextPosition = steps.findIndex((step) => step.state === 'next');
  // 線は両端の点の中心から中心まで。最初の点より手前（最初の節目に未到達）は伸ばさない
  const fillPercent = nextPosition <= 0 ? 0 : ((nextPosition - 1 + progressPercent / 100) / (count - 1)) * 100;
  const inset = `${50 / count}%`;

  return (
    <div className="relative">
      <div aria-hidden className="absolute top-1.75 h-0.5 rounded-full bg-line" style={{ left: inset, right: inset }}>
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${fillPercent}%` }} />
      </div>
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {steps.map((step) => (
          <li
            key={step.value}
            className="flex flex-col items-center gap-1.5"
            aria-label={`${step.value.toLocaleString()}${unit}${STEP_STATE_LABEL[step.state] && `（${STEP_STATE_LABEL[step.state]}）`}`}
          >
            <span className="flex size-4 items-center justify-center">
              <span className={cn('rounded-full', STEP_DOT[step.state])} />
            </span>
            <span
              aria-hidden
              className={cn(
                'text-[11px] leading-4 tabular-nums',
                step.state === 'next' ? 'font-bold text-brand-strong' : 'text-ink-muted'
              )}
            >
              {step.value.toLocaleString()}
              {step.state === 'next' && unit}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 初回トレーニング日（YYYY-MM-DD）を「2026年6月10日から」の形にする */
const formatStartDate = (isoDate: string): string => `${format(parseISO(isoDate), 'yyyy年M月d日')}から`;

/**
 * これまでの歩み（通算）。継続を主役に、実施日数と、全トレーニングに共通する発話評価の2項目を出す。
 * 実施日数は節目の段階表示と次の節目の意味（`_lib/milestones.ts`）を添え、発話評価は次の節目までの進み具合を出す。
 * 今週のうちに越えた節目には到達バッジを付ける。
 */
export function LifetimeStatsCard({ stats, weekGains, className }: LifetimeStatsCardProps) {
  if (stats === null || stats.total_active_days === 0) {
    return (
      <HomeCard title="これまでの歩み" className={className}>
        <p className="text-sm leading-relaxed text-ink-muted">
          トレーニングを始めると、実施日数と発話評価の数がここに積み上がっていきます。
        </p>
      </HomeCard>
    );
  }

  const days = stats.total_active_days;
  const assessments = stats.total_assessments;
  const dayMilestone = resolveMilestone(days, ACTIVE_DAY_MILESTONES);
  const assessmentMilestone = resolveMilestone(assessments, ASSESSMENT_MILESTONES);
  const { activeDays: dayItem, assessments: assessmentItem } = LIFETIME_ITEMS;

  return (
    <HomeCard title="これまでの歩み" className={className}>
      <div className="@container">
        <div className={LIFETIME_LAYOUT.grid}>
          <LifetimeBlock
            {...dayItem}
            className={LIFETIME_LAYOUT.main}
            badge={
              weekGains &&
              isReachedThisWeek(days, weekGains.activeDays, dayMilestone) && (
                <MilestoneBadge milestone={dayMilestone} unit={dayItem.unit} />
              )
            }
          >
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
              <BigValue value={days} unit={dayItem.unit} />
              {stats.first_training_date && (
                <span className="text-xs text-ink-muted">{formatStartDate(stats.first_training_date)}</span>
              )}
            </p>
            <div className="mt-4">
              <MilestoneLadder
                steps={resolveMilestoneSteps(days, ACTIVE_DAY_MILESTONES, LADDER_SIZE)}
                progressPercent={dayMilestone.progressPercent}
                unit={dayItem.unit}
              />
            </div>
            <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-ink-muted">
              <span>
                次の節目
                <span className="ml-1.5 font-semibold text-ink">{getActiveDayMilestoneLabel(dayMilestone.next)}</span>
              </span>
              <span className="tabular-nums">
                あと{dayMilestone.remaining.toLocaleString()}
                {dayItem.unit}
              </span>
            </p>
          </LifetimeBlock>

          <LifetimeBlock
            {...assessmentItem}
            className={LIFETIME_LAYOUT.sub}
            badge={
              weekGains &&
              isReachedThisWeek(assessments, weekGains.assessments, assessmentMilestone) && (
                <MilestoneBadge milestone={assessmentMilestone} unit={assessmentItem.unit} />
              )
            }
          >
            <p className="mt-3">
              <BigValue value={assessments} unit={assessmentItem.unit} />
            </p>
            <p className="text-xs text-ink-muted">{assessmentItem.caption}</p>
            <div className="mt-auto space-y-1.5 pt-4">
              <ProgressBar percent={assessmentMilestone.progressPercent} tone="subtle" />
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-ink-muted tabular-nums">
                <span>
                  次の節目
                  <span className="ml-1.5 font-semibold text-ink">
                    {assessmentMilestone.next.toLocaleString()}
                    {assessmentItem.unit}
                  </span>
                </span>
                <span>
                  あと{assessmentMilestone.remaining.toLocaleString()}
                  {assessmentItem.unit}
                </span>
              </p>
            </div>
          </LifetimeBlock>
        </div>
      </div>
    </HomeCard>
  );
}
