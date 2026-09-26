import { getMyUpcomingSessions } from '@/actions/sessionAction';
import { getMyDialogueAssignments } from '@/actions/dialogueAction';
import { getMyTrainingLifetimeStats, getUserTrainingPerformanceAction, type TrainingLifetimeStats } from '@/actions/performanceAction';
import type { SessionListItem } from '@gabby/types/session';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import { collectActivities, getMonthKeysCoveringThisWeek, type TrainingActivity } from './weeklyActivity';

export interface HomeData {
  nextSession: SessionListItem | null;
  assignments: DialogueAssignmentSummary[];
  activities: TrainingActivity[];
  lifetimeStats: TrainingLifetimeStats | null;
}

/** ホームの「今日やること」・補助カードの判定材料を並列で取得する */
export async function fetchHomeData(): Promise<HomeData> {
  const monthKeys = getMonthKeysCoveringThisWeek(Date.now());

  const [upcomingSessions, assignments, performances, lifetimeStats] = await Promise.all([
    // ライブセッション付き契約が無い生徒は予定が存在しないため空配列が返る
    getMyUpcomingSessions(1),
    getMyDialogueAssignments(),
    Promise.all(monthKeys.map((month) => getUserTrainingPerformanceAction(month))),
    getMyTrainingLifetimeStats(),
  ]);

  return {
    nextSession: upcomingSessions[0] ?? null,
    assignments,
    activities: collectActivities(performances.filter((res) => res.success).map((res) => res.data)),
    lifetimeStats,
  };
}
