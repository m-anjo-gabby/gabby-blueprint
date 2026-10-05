import { getMyDialogueAssignments } from '@/actions/dialogueAction';
import { getTimezoneList } from '@/actions/studentProfileAction';
import { getLatestResumeContent } from '@/actions/contentAction';
import { getMyActivePlans, type MyPlan } from '@/actions/dashboardAction';
import { getMyTrainingLifetimeStats, getUserTrainingPerformanceAction, type TrainingLifetimeStats } from '@/actions/performanceAction';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import type { ResumeContentResponse } from '@gabby/types/training';
import { collectActivities, getMonthKeysCoveringThisWeek, type TrainingActivity } from './weeklyActivity';

export interface HomeData {
  assignments: DialogueAssignmentSummary[];
  activities: TrainingActivity[];
  lifetimeStats: TrainingLifetimeStats | null;
  /** タイムゾーンマスタの表示名（IANA名 → 日本語名）。日付行のずれ警告で設定側の名称に使う */
  timezoneNames: Record<string, string>;
  /** 再開情報（ブックマーク）。参照先の教材が不可視・削除済みの場合は null */
  resume: ResumeContentResponse | null;
  /** 有効な契約（利用中・開始前）。ご契約プランのカードに使う */
  plans: MyPlan[];
}

/** ホームの「今日やること」・補助カードの判定材料を並列で取得する（ライブセッションの区画は別に遅れて取得する） */
export async function fetchHomeData(): Promise<HomeData> {
  const monthKeys = getMonthKeysCoveringThisWeek(Date.now());

  const [assignments, performances, lifetimeStats, timezones, resume, plans] = await Promise.all([
    getMyDialogueAssignments(),
    Promise.all(monthKeys.map((month) => getUserTrainingPerformanceAction(month))),
    getMyTrainingLifetimeStats(),
    getTimezoneList(),
    getLatestResumeContent(),
    getMyActivePlans(),
  ]);

  return {
    assignments,
    activities: collectActivities(performances.filter((res) => res.success).map((res) => res.data)),
    lifetimeStats,
    timezoneNames: Object.fromEntries(timezones.map((tz) => [tz.timezone, tz.display_name_ja])),
    resume: resume?.com_m_contents ? resume : null,
    plans,
  };
}
