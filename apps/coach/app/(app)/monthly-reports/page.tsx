import { Suspense } from 'react';
import { MonthSelector } from './_components/MonthSelector';
import { MonthlyReportSection } from './_components/MonthlyReportSection';
import { MonthlyReportTableSkeleton, MonthlyReportsPageHeader } from '@/components/common/ToolPageSkeletons';

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default async function MonthlyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const yearMonth = params.month || currentYearMonth();

  return (
    <div className="space-y-6">
      <MonthlyReportsPageHeader />

      <MonthSelector currentMonth={yearMonth} />

      {/* Query changes don't trigger loading.tsx, so re-key per month to show the skeleton while switching */}
      <Suspense key={yearMonth} fallback={<MonthlyReportTableSkeleton />}>
        <MonthlyReportSection yearMonth={yearMonth} />
      </Suspense>
    </div>
  );
}
