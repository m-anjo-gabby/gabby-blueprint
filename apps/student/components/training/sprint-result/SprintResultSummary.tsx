'use client';

import Link from 'next/link';
import { ArrowRight, ChartSpline, CheckCircle2, PlayCircle, type LucideIcon } from 'lucide-react';
import { getTrainingMetricConfig } from '@gabby/lib/content/ui';
import { cn } from '@/lib/utils';
import { PlayingBars } from './SprintResultQuestionList';
import type { SprintResultPlayback } from './useSprintResultPlayback';
import type { SprintResultScore } from './types';

/** 同じ教材・スプリント種別でスプリント選択画面を開くURL（リトライ・没入画面の戻る先） */
export function getSprintSelectHref(scoreData: SprintResultScore) {
  const params = new URLSearchParams({
    mode: 'sprint',
    sprint_type: scoreData.sprint_type,
    content_id: scoreData.content_id,
  });
  return `/training/sprint/play?${params.toString()}`;
}

function SummaryMetric({ icon: Icon, iconClassName, label, children }: {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-muted">
      <Icon size={14} className={cn('shrink-0', iconClassName)} />
      {label}
      <span className="font-semibold text-ink tabular-nums">{children}</span>
    </span>
  );
}

interface SprintResultSummaryProps {
  scoreData: SprintResultScore;
  courseTitle: string;
  className?: string;
}

/** コース名・回答タイプ・制限時間と、回答数/発話数/平均スコア */
export function SprintResultSummary({ scoreData, courseTitle, className }: SprintResultSummaryProps) {
  const speech = getTrainingMetricConfig('speech');
  const hasAssessment = scoreData.totalAssessmentCount > 0;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <h2 className="min-w-0 truncate text-center text-lg font-bold tracking-tight text-ink sm:text-xl">{courseTitle}</h2>
        {scoreData.question_type === '0' && (
          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-ink-soft">
            {scoreData.answer_type === '1' ? 'NO' : 'YES'}
          </span>
        )}
        <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-ink-soft tabular-nums">
          {scoreData.time_limit_sec}秒
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
        <SummaryMetric icon={CheckCircle2} iconClassName="text-ink-subtle" label="回答">
          {scoreData.total_answered}
        </SummaryMetric>
        <SummaryMetric icon={speech.icon} iconClassName={speech.theme.iconText} label="発話">
          {scoreData.totalAssessmentCount}
        </SummaryMetric>
        <SummaryMetric icon={ChartSpline} iconClassName="text-ink-subtle" label="平均スコア">
          {hasAssessment ? (
            <>
              {scoreData.averageAssessmentScore}
              <span className="ml-0.5 text-xs font-normal text-ink-muted">/100</span>
            </>
          ) : (
            '-'
          )}
        </SummaryMetric>
      </div>
    </div>
  );
}

const ACTION_BUTTON_CLASS =
  'flex h-12 w-full items-center justify-center gap-2 rounded-control text-sm font-bold transition-all active:scale-95';

/** 「全て再生」ボタン（再生中は「停止」） */
export function SprintPlayAllButton({ playback, primary = false }: { playback: SprintResultPlayback; primary?: boolean }) {
  const isPlayingAll = playback.playbackMode === 'all';
  return (
    <button
      type="button"
      onClick={playback.togglePlayAll}
      className={cn(
        ACTION_BUTTON_CLASS,
        isPlayingAll
          ? 'border border-brand-200 bg-brand-soft text-brand'
          : primary
            ? 'bg-brand text-white shadow-lg shadow-brand/10 hover:bg-brand-strong'
            : 'border border-line bg-surface text-ink-soft hover:border-brand-200 hover:text-brand'
      )}
    >
      {isPlayingAll ? <PlayingBars className="h-3 w-3" /> : <PlayCircle size={16} strokeWidth={2.5} />}
      {isPlayingAll ? '停止' : '全て再生'}
    </button>
  );
}

/** 「スプリントをリトライ」ボタン（同じ教材・種別でスプリント選択画面を開く） */
export function SprintRetryLink({ scoreData }: { scoreData: SprintResultScore }) {
  return (
    <Link
      href={getSprintSelectHref(scoreData)}
      className={cn(ACTION_BUTTON_CLASS, 'bg-brand text-white shadow-lg shadow-brand/10 hover:bg-brand-strong')}
    >
      スプリントをリトライ
      <ArrowRight size={14} strokeWidth={3} />
    </Link>
  );
}
