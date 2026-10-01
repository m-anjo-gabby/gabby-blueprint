import { Suspense } from 'react';
import { HomeView } from './_components/HomeView';
import { LiveSessionSection } from './_components/LiveSessionSection';
import { LiveSessionCardSkeleton } from './_components/LiveSessionCard';
import { fetchHomeData } from './_lib/fetchHomeData';
import { getMyLiveSessionContractsCached } from '@/lib/liveSessionContracts';
import { createRenderId } from '@gabby/lib/navigation/renderId';

/**
 * ホーム（ダッシュボード）
 * サーバー側で課題・今週・通算のトレーニング実績・再開情報（ブックマーク）・契約をまとめて取得し、
 * 「今日やること」の判定材料として渡す。開くたびに取得するため、トレーニング後の再開情報もそのまま反映される。
 * ライブセッションの区画は取得が重いため、区画ごとに Suspense で遅れて表示する。
 * 対象の契約は利用中の契約、無ければ開始前の契約（シェルのナビと同じく、有効な契約がある生徒だけに出す）。
 */
export default async function DashboardPage() {
  // 契約一覧は (app)/layout.tsx と同じ取得を使う（1リクエスト内で1回）
  const [{ assignments, activities, lifetimeStats, timezoneNames, resume, plans }, liveContracts] = await Promise.all([
    fetchHomeData(),
    getMyLiveSessionContractsCached(),
  ]);
  const liveContract = liveContracts.find((c) => c.is_current) ?? liveContracts.find((c) => c.is_active);

  return (
    <HomeView
      assignments={assignments}
      activities={activities}
      lifetimeStats={lifetimeStats}
      timezoneNames={timezoneNames}
      resume={resume}
      plans={plans}
      liveSection={
        liveContract && (
          <Suspense fallback={<LiveSessionCardSkeleton />}>
            <LiveSessionSection contract={liveContract} />
          </Suspense>
        )
      }
      renderId={createRenderId()}
    />
  );
}
