import { getMyUpcomingSessions } from '@/actions/sessionAction';
import { getMyDialogueAssignments } from '@/actions/dialogueAction';
import { getTimezoneList } from '@/actions/studentProfileAction';
import { getMyTrainingLifetimeStats, getUserTrainingPerformanceAction, type TrainingLifetimeStats } from '@/actions/performanceAction';
import type { SessionListItem } from '@gabby/types/session';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import { collectActivities, getMonthKeysCoveringThisWeek, type TrainingActivity } from './weeklyActivity';

export interface HomeData {
  nextSession: SessionListItem | null;
  assignments: DialogueAssignmentSummary[];
  activities: TrainingActivity[];
  lifetimeStats: TrainingLifetimeStats | null;
  /** タイムゾーンマスタの表示名（IANA名 → 日本語名）。日付行のずれ警告で設定側の名称に使う */
  timezoneNames: Record<string, string>;
}

/** ホームの「今日やること」・補助カードの判定材料を並列で取得する */
export async function fetchHomeData(): Promise<HomeData> {
  const monthKeys = getMonthKeysCoveringThisWeek(Date.now());

  const [upcomingSessions, assignments, performances, lifetimeStats, timezones] = await Promise.all([
    // ライブセッション付き契約が無い生徒は予定が存在しないため空配列が返る
    getMyUpcomingSessions(1),
    getMyDialogueAssignments(),
    Promise.all(monthKeys.map((month) => getUserTrainingPerformanceAction(month))),
    getMyTrainingLifetimeStats(),
    getTimezoneList(),
  ]);

  return {
    nextSession: upcomingSessions[0] ?? null,
    assignments,
    activities: collectActivities(performances.filter((res) => res.success).map((res) => res.data)),
    lifetimeStats,
    timezoneNames: Object.fromEntries(timezones.map((tz) => [tz.timezone, tz.display_name_ja])),
  };
}
