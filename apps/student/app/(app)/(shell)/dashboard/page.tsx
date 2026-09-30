import { HomeView } from './_components/HomeView';
import { fetchHomeData } from './_lib/fetchHomeData';
import { createRenderId } from '@gabby/lib/navigation/renderId';

/**
 * ホーム（ダッシュボード）
 * サーバー側で予定・課題・今週・通算のトレーニング実績・再開情報（ブックマーク）をまとめて取得し、
 * 「今日やること」の判定材料として渡す。開くたびに取得するため、トレーニング後の再開情報もそのまま反映される。
 */
export default async function DashboardPage() {
  const { nextSession, assignments, activities, lifetimeStats, timezoneNames, resume } = await fetchHomeData();

  return (
    <HomeView
      nextSession={nextSession}
      assignments={assignments}
      activities={activities}
      lifetimeStats={lifetimeStats}
      timezoneNames={timezoneNames}
      resume={resume}
      renderId={createRenderId()}
    />
  );
}
