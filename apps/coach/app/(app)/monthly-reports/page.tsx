import { Suspense } from 'react';
import { PageSkeleton } from '@gabby/lib/components/common/PageSkeleton';
import { MonthSelector } from './_components/MonthSelector';
import { MonthlyReportSection } from './_components/MonthlyReportSection';

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
      <div className="max-w-2xl">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Monthly Report</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Your live session counts by student and day. Cells in amber need a lesson to be finalized;
          cells in rose contain a late cancellation, no-show, or early-ended session.
        </p>
      </div>

      <MonthSelector currentMonth={yearMonth} />

      {/* Query changes don't trigger loading.tsx, so re-key per month to show the skeleton while switching */}
      <Suspense key={yearMonth} fallback={<PageSkeleton label="Loading..." variant="table" header={false} />}>
        <MonthlyReportSection yearMonth={yearMonth} />
      </Suspense>
    </div>
  );
}
