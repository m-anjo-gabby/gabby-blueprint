import { Suspense } from 'react';
import { toIsoMonthInZone } from '@gabby/lib/date/date';
import { getMyProfile } from '@/actions/coachProfileAction';
import { MonthlyReportsPageHeader, MonthlyReportTableSkeleton } from '@/components/common/ToolPageSkeletons';
import { MonthlyReportSection } from './_components/MonthlyReportSection';
import { MonthSelector } from './_components/MonthSelector';

export default async function MonthlyReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [params, profile] = await Promise.all([searchParams, getMyProfile()]);
  // レポートの月はコーチの暦で区切るため、指定が無ければコーチのタイムゾーンでの今月を開く（サーバーの時刻は UTC）
  const yearMonth = params.month || toIsoMonthInZone(new Date(), profile?.timezone || 'Asia/Tokyo');

  return (
    <div className="space-y-6">
      <MonthlyReportsPageHeader />

      <MonthSelector currentMonth={yearMonth} />

      {/* クエリの変更では loading.tsx が出ないため、月ごとに key を変えて切り替え中に骨組みを出す */}
      <Suspense key={yearMonth} fallback={<MonthlyReportTableSkeleton />}>
        <MonthlyReportSection yearMonth={yearMonth} />
      </Suspense>
    </div>
  );
}
