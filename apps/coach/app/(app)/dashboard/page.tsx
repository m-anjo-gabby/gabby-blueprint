import { Suspense } from 'react';
import { getMyProfile } from '@/actions/coachProfileAction';
import { getPendingIncomingRequestsForCoach } from '@/actions/matchingRequestAction';
import DashboardHeader from './_components/DashboardHeader';
import { DashboardLayout } from './_components/DashboardLayout';
import AttentionStrip from './_components/AttentionStrip';
import TodaysSessionsPanel, { TodaysSessionsPanelSkeleton } from './_components/TodaysSessionsPanel';
import SessionTasksPanel, { SessionTasksPanelSkeleton } from './_components/SessionTasksPanel';
import { MyRatingCard, MyRatingCardSkeleton } from '@/components/rating/MyRatingCard';
import { getMyCoachRatingStats } from '@/actions/coachRatingAction';

function getGreeting(timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date())
  );
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

async function RatingPanel() {
  return <MyRatingCard stats={await getMyCoachRatingStats()} />;
}

export default async function Page() {
  const [profile, pendingRequests] = await Promise.all([
    getMyProfile(),
    getPendingIncomingRequestsForCoach(),
  ]);

  const timezone = profile?.timezone || 'Asia/Tokyo';
  const firstName = profile?.user_name?.split(' ')[0] || 'Coach';
  const pendingRequestCount = pendingRequests.length;
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone }).format(new Date());

  // 区画ごとに取得・表示する（重い区画の取得を待たずに、先に画面の枠と見出しを出す）
  return (
    <DashboardLayout
      header={<DashboardHeader greeting={getGreeting(timezone)} firstName={firstName} dateLabel={dateLabel} />}
      attention={<AttentionStrip pendingRequestCount={pendingRequestCount} />}
      todaysSessions={
        <Suspense fallback={<TodaysSessionsPanelSkeleton />}>
          <TodaysSessionsPanel timezone={timezone} />
        </Suspense>
      }
      sessionTasks={
        <Suspense fallback={<SessionTasksPanelSkeleton />}>
          <SessionTasksPanel timezone={timezone} />
        </Suspense>
      }
      rating={
        <Suspense fallback={<MyRatingCardSkeleton />}>
          <RatingPanel />
        </Suspense>
      }
    />
  );
}
