import { Suspense } from 'react';
import { CalendarWorkspace } from './_components/CalendarWorkspace';
import { CalendarBoard } from './_components/CalendarBoard';
import { CalendarMonthSection } from './_components/CalendarMonthSection';
import { CalendarPageHeader } from './_components/CalendarSkeleton';
import { getPendingIncomingRequestsForCoach } from '@/actions/matchingRequestAction';
import { getMyProfile } from '@/actions/coachProfileAction';
import { toIsoMonthInZone } from '@gabby/lib/date/date';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [{ month: requestedMonth }, requests, profile] = await Promise.all([
    searchParams,
    getPendingIncomingRequestsForCoach(),
    getMyProfile(),
  ]);
  // 表示月は ?month= で持つ（無い・不正な場合はコーチのタイムゾーンでの今月）
  const month =
    requestedMonth && MONTH_PATTERN.test(requestedMonth)
      ? requestedMonth
      : toIsoMonthInZone(new Date(), profile?.timezone || 'Asia/Tokyo');

  return (
    <div className="space-y-6">
      <CalendarPageHeader />

      <div className="max-w-5xl">
        <CalendarWorkspace
          initialRequests={requests}
          board={
            // 月を切り替えると key が変わり、日付の枠を残したまま予定だけを骨組みにして取り直す
            <Suspense key={month} fallback={<CalendarBoard month={month} initialSessions={null} initialEvents={null} />}>
              <CalendarMonthSection month={month} />
            </Suspense>
          }
        />
      </div>
    </div>
  );
}
