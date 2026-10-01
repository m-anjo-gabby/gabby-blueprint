import { Suspense } from 'react';
import { toIsoMonthInZone } from '@gabby/lib/date/date';
import { isMonthParam } from '@gabby/lib/calendar/monthGridRange';
import { getMyProfile } from '@/actions/studentProfileAction';
import { CalendarBoard } from './_components/CalendarBoard';
import { CalendarMonthSection } from './_components/CalendarMonthSection';
import { CalendarPageHeader } from './_components/CalendarSkeleton';

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: requestedMonth } = await searchParams;
  // 表示月は ?month= で持つ（無い・不正な場合は利用者のタイムゾーンでの今月）
  const month = isMonthParam(requestedMonth)
    ? requestedMonth
    : toIsoMonthInZone(new Date(), (await getMyProfile())?.timezone || 'Asia/Tokyo');

  return (
    <>
      <CalendarPageHeader />

      {/* 月を切り替えると key が変わり、日付の枠を残したまま予定だけを骨組みにして取り直す */}
      <Suspense key={month} fallback={<CalendarBoard month={month} initialSessions={null} initialEvents={null} bookableSlots={null} />}>
        <CalendarMonthSection month={month} />
      </Suspense>
    </>
  );
}
