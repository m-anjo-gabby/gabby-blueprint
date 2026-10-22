import { isTrainingMenuEnabled } from '@gabby/lib/trainingMenu/availability';
import type { ResumeContentResponse } from '@gabby/types/training';
import { getLatestResumeContent } from '@/actions/contentAction';
import { getMyActivePlans, type MyPlan } from '@/actions/dashboardAction';
import {
  getMyTrainingLifetimeStats,
  getUserTrainingPerformance,
  type TrainingLifetimeStats,
} from '@/actions/performanceAction';
import { getTimezoneList } from '@/actions/studentProfileAction';
import { getTodayTrainingMenu } from '@/lib/trainingMenu';
import type { TodayMenuState } from '../_components/TodayMenuCard';
import { collectActivities, getMonthKeysCoveringThisWeek, type TrainingActivity } from './weeklyActivity';

export interface HomeData {
  activities: TrainingActivity[];
  lifetimeStats: TrainingLifetimeStats | null;
  /** タイムゾーンマスタの表示名（IANA名 → 日本語名）。日付行のずれ警告で設定側の名称に使う */
  timezoneNames: Record<string, string>;
  /** 再開情報（ブックマーク）。参照先の教材が不可視・削除済みの場合は null */
  resume: ResumeContentResponse | null;
  /** 有効な契約（利用中・開始前）。ご契約プランのカードに使う */
  plans: MyPlan[];
  /** 今日のトレーニングメニュー（主役のカード）。出さない環境では null（教材・お気に入りへの案内になる） */
  todayMenu: TodayMenuState;
}

/** ホームの今日のトレーニングメニュー・補助カードの材料を並列で取得する（ライブセッションの区画は別に遅れて取得する） */
export async function fetchHomeData(): Promise<HomeData> {
  const monthKeys = getMonthKeysCoveringThisWeek(Date.now());

  const [performances, lifetimeStats, timezones, resume, plans, todayMenu] = await Promise.all([
    Promise.all(monthKeys.map((month) => getUserTrainingPerformance(month))),
    getMyTrainingLifetimeStats(),
    getTimezoneList(),
    getLatestResumeContent(),
    getMyActivePlans(),
    isTrainingMenuEnabled() ? getTodayTrainingMenu() : null,
  ]);

  return {
    activities: collectActivities(performances.filter((res) => res.success).map((res) => res.data)),
    lifetimeStats,
    timezoneNames: Object.fromEntries(timezones.map((tz) => [tz.timezone, tz.display_name_ja])),
    resume: resume?.com_m_contents ? resume : null,
    plans,
    todayMenu: todayMenu === null ? null : todayMenu.success ? todayMenu.data : 'error',
  };
}
