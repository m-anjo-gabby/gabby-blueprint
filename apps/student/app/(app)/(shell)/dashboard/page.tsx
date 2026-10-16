import { Suspense } from 'react';
import { HomeView } from './_components/HomeView';
import { LiveSessionSection } from './_components/LiveSessionSection';
import { LiveSessionCardSkeleton } from './_components/LiveSessionCard';
import { HomeEventSection } from './_components/HomeEventSection';
import { HomeEventCardSkeleton } from './_components/HomeEventCard';
import { HomeNoticeCard } from './_components/HomeNoticeCard';
import { fetchHomeData } from './_lib/fetchHomeData';
import { getMyLiveSessionContractsCached } from '@/lib/liveSessionContracts';
import { createRenderId } from '@gabby/lib/navigation/renderId';
import { getNoticesCached } from '@gabby/lib/notice/getNoticesCached';

/**
 * ホーム（ダッシュボード）
 * サーバー側で課題・今週・通算のトレーニング実績・再開情報（ブックマーク）・契約をまとめて取得し、
 * 「今日やること」の判定材料として渡す。開くたびに取得するため、トレーニング後の再開情報もそのまま反映される。
 * ライブセッションとグループセッションの区画は、区画ごとに Suspense で遅れて表示する。
 * グループセッションは全プランの生徒に出す。
 * 表示方法が「ホームのカード」の未読のお知らせがあれば、先頭の1件を上部に出す（お知らせはシェルの通知センターと同じ取得を使う）。
 * 対象の契約は利用中の契約、無ければ開始前の契約（シェルのナビと同じく、有効な契約がある生徒だけに出す）。
 */
export default async function DashboardPage() {
  // 契約一覧は (app)/layout.tsx と同じ取得を使う（1リクエスト内で1回）
  const [{ assignments, activities, lifetimeStats, timezoneNames, resume, plans }, liveContracts, notices] = await Promise.all([
    fetchHomeData(),
    getMyLiveSessionContractsCached(),
    getNoticesCached(),
  ]);
  // 取得順（重要→公開日の新しい順）のまま先頭を出す
  const homeNotices = notices.data.filter((n) => n.display_mode === 'HOME' && !n.is_read);
  const liveContract = liveContracts.find((c) => c.is_current) ?? liveContracts.find((c) => c.is_active);

  return (
    <HomeView
      assignments={assignments}
      activities={activities}
      lifetimeStats={lifetimeStats}
      timezoneNames={timezoneNames}
      resume={resume}
      plans={plans}
      noticeCard={homeNotices[0] && <HomeNoticeCard notice={homeNotices[0]} moreCount={homeNotices.length - 1} />}
      liveSection={
        liveContract && (
          <Suspense fallback={<LiveSessionCardSkeleton />}>
            <LiveSessionSection contract={liveContract} contracts={liveContracts} />
          </Suspense>
        )
      }
      eventSection={
        <Suspense fallback={<HomeEventCardSkeleton />}>
          <HomeEventSection />
        </Suspense>
      }
      renderId={createRenderId()}
    />
  );
}
