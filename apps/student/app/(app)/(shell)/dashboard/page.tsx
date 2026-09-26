import { HomeView } from './_components/HomeView';
import { fetchHomeData } from './_lib/fetchHomeData';

/**
 * ホーム（ダッシュボード）
 * サーバー側で予定・課題・今週・通算のトレーニング実績をまとめて取得し、「今日やること」の判定材料として渡す。
 * 再開情報（ブックマーク）は他画面と共有するクライアントストアで扱うため HomeView 側で取得する。
 */
export default async function DashboardPage() {
  const { nextSession, assignments, activities, lifetimeStats, timezoneNames } = await fetchHomeData();

  return (
    <HomeView
      nextSession={nextSession}
      assignments={assignments}
      activities={activities}
      lifetimeStats={lifetimeStats}
      timezoneNames={timezoneNames}
    />
  );
}
