'use client';

import { useEffect } from 'react';
import { useNow } from '@gabby/lib/hooks/useNow';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { getHourInZone } from '@gabby/lib/date/date';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useServerSyncedState } from '@gabby/lib/hooks/useServerSyncedState';
import { useRefreshOnRestoredRender } from '@gabby/lib/hooks/useRefreshOnRestoredRender';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import type { ResumeContentResponse } from '@gabby/types/training';
import type { TrainingLifetimeStats } from '@/actions/performanceAction';
import type { MyPlan } from '@/actions/dashboardAction';
import { clearResumeContent } from '@/actions/contentAction';
import { cn } from '@/lib/utils';
import { resolveTodayFocus } from '../_lib/todayFocus';
import { buildCurrentWeek, resolveStreakDays, type TrainingActivity } from '../_lib/weeklyActivity';
import { TodayDateLine } from './TodayDateLine';
import { HOME_LAYOUT } from './HomeCard';
import { HomeHeaderSkeleton, WeeklyActivityCardSkeleton } from './HomeSkeleton';
import { TodayFocusCard } from './TodayFocusCard';
import { ContinueCard } from './ContinueCard';
import { WeeklyActivityCard } from './WeeklyActivityCard';
import { LifetimeStatsCard } from './LifetimeStatsCard';
import { CoachAssignmentsCard } from './CoachAssignmentsCard';
import { PlanCard } from './PlanCard';

interface HomeViewProps {
  assignments: DialogueAssignmentSummary[];
  /** 今週を含む月のトレーニング実績（実施日時と件数）。今週の実施日数・発話回数の算出に使う */
  activities: TrainingActivity[];
  /** 通算のトレーニング実績（未実施の場合は null） */
  lifetimeStats: TrainingLifetimeStats | null;
  /** タイムゾーンマスタの表示名（IANA名 → 日本語名） */
  timezoneNames: Record<string, string>;
  /** 再開情報（ブックマーク）。無い場合・参照先の教材が見えない場合は null */
  resume: ResumeContentResponse | null;
  /** 有効な契約（利用中・開始前） */
  plans: MyPlan[];
  /** ライブセッションの区画（サーバー側で Suspense に包んで渡す。ライブセッション付きの契約が無い場合は null） */
  liveSection: React.ReactNode;
  /** グループセッションの区画（サーバー側で Suspense に包んで渡す。全プランで出す） */
  eventSection: React.ReactNode;
  /** サーバー描画ごとのID（キャッシュ済みの画面の再利用を検知して取り直すために使う） */
  renderId: string;
}

const getGreeting = (hour: number) => {
  if (hour >= 4 && hour < 11) return 'おはようございます';
  if (hour >= 11 && hour < 18) return 'こんにちは';
  return 'こんばんは';
};

/**
 * ホーム画面。
 * 1行目に自主トレーニングの「今日やること」（主役）と今週のトレーニング、2行目に「これからの予定」（ライブセッション（契約がある場合だけ）とグループセッション）、
 * 3行目にこれまでの歩みとご契約プラン、4行目に主役に出ていない「続きから」と課題を並べる（モバイル=1列、PC(lg以上)=3列グリッド）。
 * プランによる違いは2行目のライブセッションの有無だけにする。トレーニングの各画面への入口はシェルのトレーニングタブ（TrainingSectionNav）が受け持つ。
 * 現在時刻の確定前（初回表示のハイドレーション時）は、時刻に依存する部分を loading.tsx と同じ骨組みで描く。
 */
export function HomeView({
  assignments,
  activities,
  lifetimeStats,
  timezoneNames,
  resume: serverResume,
  plans,
  liveSection,
  eventSection,
  renderId,
}: HomeViewProps) {
  const nowMs = useNow();
  const timezone = useTimezone();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const userName = useUserStore((state) => state.user?.user_name);
  const settingTimezone = useUserStore((state) => state.user?.timezone ?? null);
  const fetchNotices = useNoticeStore((state) => state.fetchNotices);
  const [resume, setResume] = useServerSyncedState(serverResume);
  // 「戻る・進む」等でキャッシュ済みの画面が再利用された場合は、最新のデータに取り直す
  useRefreshOnRestoredRender(renderId);

  useEffect(() => {
    // お知らせは通知センター用
    fetchNotices();
  }, [fetchNotices]);

  const handleClearResume = async () => {
    const ok = await showConfirm('ブックマークを削除？', 'この教材のブックマークを削除します。よろしいですか？', {
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await clearResumeContent();
      setResume(null);
      showToast('再開情報を削除しました', 'success');
    } catch (error) {
      showToast('削除に失敗しました', 'error');
      console.error(error);
    }
  };

  const pendingAssignments = assignments.filter((a) => !a.is_set_completed);
  const focus = resolveTodayFocus({ assignments: pendingAssignments, resume });

  // 「今日やること」に出した項目は補助カード側では重複表示しない
  const otherAssignments = pendingAssignments.filter(
    (a) => !(focus.kind === 'assignment' && focus.assignment.assignment_id === a.assignment_id)
  );
  const week = nowMs !== null ? buildCurrentWeek(activities, timezone, nowMs) : null;
  const streakDays = nowMs !== null ? resolveStreakDays(lifetimeStats, timezone, nowMs) : 0;
  const showAssignments = otherAssignments.length > 0;
  // 再開が主役に出ていない（課題を優先した）場合だけ、補助カード「続きから」に出す
  const showContinue = resume !== null && focus.kind !== 'resume';

  return (
    <div className={HOME_LAYOUT.page}>
      {nowMs !== null ? (
        <header className={HOME_LAYOUT.header}>
          <TodayDateLine
            nowMs={nowMs}
            timezone={timezone}
            settingTimezone={settingTimezone}
            timezoneNames={timezoneNames}
          />
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {getGreeting(getHourInZone(new Date(nowMs).toISOString(), timezone))}
            {userName && <span className="text-ink-muted">、{userName}さん</span>}
          </h1>
        </header>
      ) : (
        <HomeHeaderSkeleton />
      )}

      <div className={HOME_LAYOUT.grid}>
        <div className={HOME_LAYOUT.focus}>
          <TodayFocusCard focus={focus} onClearResume={handleClearResume} />
        </div>

        {week ? (
          <WeeklyActivityCard
            days={week.days}
            activeCount={week.activeCount}
            assessmentCount={week.assessmentCount}
            streakDays={streakDays}
          />
        ) : (
          <WeeklyActivityCardSkeleton />
        )}

        {/* 2行目: これからの予定。ライブセッション（契約がある場合だけ、2列分）とグループセッション。ライブセッションが無ければグループセッションを1行に広げる */}
        {liveSection && <div className={HOME_LAYOUT.wide}>{liveSection}</div>}
        <div className={liveSection ? undefined : HOME_LAYOUT.fullRow}>{eventSection}</div>

        {/* 3行目: これまでの歩み（2列分）とご契約プラン。契約が取得できない場合は歩みを1行に広げる */}
        <LifetimeStatsCard
          stats={lifetimeStats}
          weekGains={week && { activeDays: week.activeCount, assessments: week.assessmentCount }}
          className={plans.length > 0 ? HOME_LAYOUT.wide : HOME_LAYOUT.fullRow}
        />
        {plans.length > 0 && <PlanCard plans={plans} nowMs={nowMs} timezone={timezone} />}

        {/* 4行目: 途中の教材の再開（主役に出ていない場合）とコーチからの課題。両方あるときは半分ずつ、片方だけなら全幅 */}
        {(showContinue || showAssignments) && (
          <div className={cn('grid grid-cols-1 gap-4 lg:col-span-3', showContinue && showAssignments && 'lg:grid-cols-2')}>
            {showContinue && <ContinueCard resume={resume} onClear={handleClearResume} />}
            {showAssignments && <CoachAssignmentsCard assignments={otherAssignments} />}
          </div>
        )}
      </div>
    </div>
  );
}
