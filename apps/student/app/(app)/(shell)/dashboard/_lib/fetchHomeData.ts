import { getMyUpcomingSessions } from '@/actions/sessionAction';
import { getMyDialogueAssignments } from '@/actions/dialogueAction';
import { getUserTrainingPerformanceAction } from '@/actions/performanceAction';
import type { SessionListItem } from '@gabby/types/session';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import { collectActivityDates, getMonthKeysCoveringThisWeek } from './weeklyActivity';

export interface HomeData {
  nextSession: SessionListItem | null;
  assignments: DialogueAssignmentSummary[];
  activityDates: string[];
}

/** ホームの「今日やること」・補助カードの判定材料を並列で取得する */
export async function fetchHomeData(): Promise<HomeData> {
  const monthKeys = getMonthKeysCoveringThisWeek(Date.now());

  const [upcomingSessions, assignments, performances] = await Promise.all([
    // ライブセッション付き契約が無い生徒は予定が存在しないため空配列が返る
    getMyUpcomingSessions(1),
    getMyDialogueAssignments(),
    Promise.all(monthKeys.map((month) => getUserTrainingPerformanceAction(month))),
  ]);

  return {
    nextSession: upcomingSessions[0] ?? null,
    assignments,
    activityDates: collectActivityDates(performances.filter((res) => res.success).map((res) => res.data)),
  };
}
