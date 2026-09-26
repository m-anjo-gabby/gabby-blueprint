'use client';

import { useEffect, useState } from 'react';
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
import { resolveTodayFocus } from '../_lib/todayFocus';
import { buildCurrentWeek, resolveStreakDays, type TrainingActivity } from '../_lib/weeklyActivity';
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
}

const getGreeting = (hour: number) => {
  if (hour >= 4 && hour < 11) return 'おはようございます';
  if (hour >= 11 && hour < 18) return 'こんにちは';
  return 'こんばんは';
};

const formatToday = (nowMs: number, timeZone: string) =>
  new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(nowMs));

/**
 * ホーム画面。
 * 「今日やること」を1つだけ主役に据え、残りの情報は補助カードとして並べる
 * （モバイル=1列、PC(lg以上)=主役2列分＋サイド1列のグリッド）。
 */
export function HomeView({ nextSession, assignments, activities, lifetimeStats }: HomeViewProps) {
  const nowMs = useNow();
  const timezone = useTimezone();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const userName = useUserStore((state) => state.user?.user_name);
  const fetchNotices = useNoticeStore((state) => state.fetchNotices);
  const fetchAllContents = useContentStore((state) => state.fetchAllContents);
  const { resumeData, fetchResume, clearResume } = useResumeStore();
  // 再開情報の取得前に「今日やること」を決めると、取得後に主役が入れ替わってちらつくため待つ
  const [isResumeReady, setIsResumeReady] = useState(() => useResumeStore.getState().lastFetched !== null);

  useEffect(() => {
    // 教材一覧はライブラリ遷移時の表示を速めるための先読み、お知らせは通知センター用
    fetchAllContents();
    fetchNotices();
    fetchResume().finally(() => setIsResumeReady(true));
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

  const resume = resumeData?.com_m_contents ? resumeData : null;
  const pendingAssignments = assignments.filter((a) => !a.is_set_completed);
  const focus =
    nowMs !== null && isResumeReady
      ? resolveTodayFocus({ nextSession, resume, assignments: pendingAssignments, nowMs })
      : null;

  // 「今日やること」に出した項目は補助カード側では重複表示しない
  const showNextSession = nextSession !== null && focus !== null && focus.kind !== 'session';
  const showContinue = resume !== null && focus !== null && focus.kind !== 'resume';
  const otherAssignments = pendingAssignments.filter(
    (a) => !(focus?.kind === 'assignment' && focus.assignment.assignment_id === a.assignment_id)
  );
  const week = nowMs !== null ? buildCurrentWeek(activities, timezone, nowMs) : null;
  const streakDays = nowMs !== null ? resolveStreakDays(lifetimeStats, timezone, nowMs) : 0;

  // PC(3列)で空きマスが出ないよう、「これまでの積み上げ」の幅（1列/2列）を他のカードの占有マス数から決める。
  // 例: アプリのみ契約 = ヒーロー2＋今週1 → 積み上げ2＋メニュー1、ライブ契約 = ヒーロー2＋次回1 → 今週1＋積み上げ1＋メニュー1
  const occupiedCells =
    2 + (showNextSession ? 1 : 0) + (showContinue ? 2 : 0) + (otherAssignments.length > 0 ? 2 : 0) + 1 + 1;
  const lifetimeSpansTwo = occupiedCells % 3 === 1;

  return (
    <div className="space-y-6 pb-6">
      <header className="space-y-1 px-1">
        <p className="text-sm text-ink-muted">{nowMs !== null ? formatToday(nowMs, timezone) : ' '}</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {nowMs !== null ? getGreeting(getHourInZone(new Date(nowMs).toISOString(), timezone)) : 'ようこそ'}
          {userName && <span className="text-ink-muted">、{userName}さん</span>}
        </h1>
      </header>

      {/* PCで横に並ぶカードは行ごとに高さを揃える（各カードは h-full で行の高さいっぱいに広がる） */}
      <div className="grid gap-4 lg:grid-cols-3 lg:grid-flow-dense">
        <div className="lg:col-span-2">
          {focus !== null && nowMs !== null ? (
            <TodayFocusCard focus={focus} nowMs={nowMs} timezone={timezone} onClearResume={handleClearResume} />
          ) : (
            <Skeleton className="h-60 w-full rounded-card" />
          )}
        </div>

        {showNextSession && <NextSessionCard session={nextSession} timezone={timezone} />}

        {showContinue && (
          <div className="lg:col-span-2">
            <ContinueCard resume={resume} onClear={handleClearResume} />
          </div>
        )}

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

        <LifetimeStatsCard stats={lifetimeStats} className={lifetimeSpansTwo ? 'lg:col-span-2' : undefined} />

        {otherAssignments.length > 0 && (
          <div className="lg:col-span-2">
            <CoachAssignmentsCard assignments={otherAssignments} />
          </div>
        )}

        <TrainingMenuCard />
      </div>
    </div>
  );
}
