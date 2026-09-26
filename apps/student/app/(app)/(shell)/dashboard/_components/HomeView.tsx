'use client';

import { useEffect } from 'react';
import { useNow } from '@gabby/lib/hooks/useNow';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { getHourInZone } from '@gabby/lib/date/date';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import type { SessionListItem } from '@gabby/types/session';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import type { TrainingLifetimeStats } from '@/actions/performanceAction';
import { useContentStore } from '@/stores/useContentStore';
import { useResumeStore } from '@/stores/useResumeStore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { resolveTodayFocus } from '../_lib/todayFocus';
import { buildCurrentWeek, resolveStreakDays, type TrainingActivity } from '../_lib/weeklyActivity';
import { TodayDateLine } from './TodayDateLine';
import { TodayFocusCard } from './TodayFocusCard';
import { NextSessionCard } from './NextSessionCard';
import { ContinueCard } from './ContinueCard';
import { WeeklyActivityCard } from './WeeklyActivityCard';
import { LifetimeStatsCard } from './LifetimeStatsCard';
import { CoachAssignmentsCard } from './CoachAssignmentsCard';
import { TrainingMenuCard } from './TrainingMenuCard';

interface HomeViewProps {
  nextSession: SessionListItem | null;
  assignments: DialogueAssignmentSummary[];
  /** 今週を含む月のトレーニング実績（実施日時と件数）。今週の実施日数・発話回数の算出に使う */
  activities: TrainingActivity[];
  /** 通算のトレーニング実績（未実施の場合は null） */
  lifetimeStats: TrainingLifetimeStats | null;
  /** タイムゾーンマスタの表示名（IANA名 → 日本語名） */
  timezoneNames: Record<string, string>;
}

const getGreeting = (hour: number) => {
  if (hour >= 4 && hour < 11) return 'おはようございます';
  if (hour >= 11 && hour < 18) return 'こんにちは';
  return 'こんばんは';
};

/**
 * ホーム画面。
 * 「今日やること」を1つだけ主役に据え、残りの情報は補助カードとして並べる
 * （モバイル=1列、PC(lg以上)=3列グリッド。1〜2行目は主役・予定・実績・メニュー、3行目は「続きから」と課題）。
 */
export function HomeView({ nextSession, assignments, activities, lifetimeStats, timezoneNames }: HomeViewProps) {
  const nowMs = useNow();
  const timezone = useTimezone();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const userName = useUserStore((state) => state.user?.user_name);
  const settingTimezone = useUserStore((state) => state.user?.timezone ?? null);
  const fetchNotices = useNoticeStore((state) => state.fetchNotices);
  const fetchAllContents = useContentStore((state) => state.fetchAllContents);
  const { resumeData, fetchResume, clearResume } = useResumeStore();

  useEffect(() => {
    // 教材一覧はライブラリ遷移時の表示を速めるための先読み、お知らせは通知センター用
    fetchAllContents();
    fetchNotices();
    fetchResume();
  }, [fetchAllContents, fetchNotices, fetchResume]);

  const handleClearResume = async () => {
    const ok = await showConfirm('ブックマークを削除？', 'この教材のブックマークを削除します。よろしいですか？', {
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await clearResume();
      showToast('再開情報を削除しました', 'success');
    } catch (error) {
      showToast('削除に失敗しました', 'error');
      console.error(error);
    }
  };

  // 参照先の教材が不可視・削除済みのブックマークは表示しない
  const resume = resumeData?.com_m_contents ? resumeData : null;
  const pendingAssignments = assignments.filter((a) => !a.is_set_completed);
  const focus = nowMs !== null ? resolveTodayFocus({ nextSession, assignments: pendingAssignments, nowMs }) : null;

  // 「今日やること」に出した項目は補助カード側では重複表示しない
  const showNextSession = nextSession !== null && focus !== null && focus.kind !== 'session';
  const otherAssignments = pendingAssignments.filter(
    (a) => !(focus?.kind === 'assignment' && focus.assignment.assignment_id === a.assignment_id)
  );
  const week = nowMs !== null ? buildCurrentWeek(activities, timezone, nowMs) : null;
  const streakDays = nowMs !== null ? resolveStreakDays(lifetimeStats, timezone, nowMs) : 0;
  const showAssignments = otherAssignments.length > 0;

  return (
    <div className="space-y-6 pb-6">
      <header className="space-y-1 px-1">
        {nowMs !== null ? (
          <TodayDateLine
            nowMs={nowMs}
            timezone={timezone}
            settingTimezone={settingTimezone}
            timezoneNames={timezoneNames}
          />
        ) : (
          <p className="text-sm text-ink-muted">{' '}</p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {nowMs !== null ? getGreeting(getHourInZone(new Date(nowMs).toISOString(), timezone)) : 'ようこそ'}
          {userName && <span className="text-ink-muted">、{userName}さん</span>}
        </h1>
      </header>

      {/* PCで横に並ぶカードは行ごとに高さを揃える（各カードは h-full で行の高さいっぱいに広がる）。
          モバイルも grid-cols-1（minmax(0,1fr)）を明示する。暗黙の列は中身の最小幅まで広がるため、
          truncate した長いコーチ名・課題名が省略前の幅で列を押し広げ、画面外へはみ出してしまう */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {focus !== null && nowMs !== null ? (
            <TodayFocusCard focus={focus} nowMs={nowMs} timezone={timezone} />
          ) : (
            <Skeleton className="h-60 w-full rounded-card" />
          )}
        </div>

        {showNextSession && <NextSessionCard session={nextSession} timezone={timezone} />}

        {week ? (
          <WeeklyActivityCard
            days={week.days}
            activeCount={week.activeCount}
            assessmentCount={week.assessmentCount}
            streakDays={streakDays}
          />
        ) : (
          <Skeleton className="h-48 w-full rounded-card" />
        )}

        {/* 2行目で空きマスが出ないよう、次回のセッションが1行目に入らない場合は「これまでの積み上げ」を2列分にする。
            例: アプリのみ契約 = 積み上げ2＋メニュー1、ライブ契約 = 今週1＋積み上げ1＋メニュー1 */}
        <LifetimeStatsCard stats={lifetimeStats} className={showNextSession ? undefined : 'lg:col-span-2'} />

        <TrainingMenuCard />

        {/* 3行目: 途中の教材の再開とコーチからの課題。両方あるときは半分ずつ、片方だけなら全幅 */}
        {(resume !== null || showAssignments) && (
          <div className={cn('grid grid-cols-1 gap-4 lg:col-span-3', resume !== null && showAssignments && 'lg:grid-cols-2')}>
            {resume !== null && <ContinueCard resume={resume} onClear={handleClearResume} />}
            {showAssignments && <CoachAssignmentsCard assignments={otherAssignments} />}
          </div>
        )}
      </div>
    </div>
  );
}
