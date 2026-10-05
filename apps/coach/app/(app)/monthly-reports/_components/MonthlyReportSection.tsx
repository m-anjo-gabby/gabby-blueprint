import { getMyMonthlyReport } from '@/actions/monthlyReportAction';
import { SummaryCard } from './SummaryCard';
import { MonthlyReportGrid } from './MonthlyReportGrid';

/**
 * Monthly report body (summary + grid).
 * page.tsx wraps it in a <Suspense> keyed by month so a skeleton shows while switching months.
 */
export async function MonthlyReportSection({ yearMonth }: { yearMonth: string }) {
  const result = await getMyMonthlyReport(yearMonth);

  if (!result.success) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {result.message}
      </div>
    );
  }

  return (
    <>
      <SummaryCard report={result.report} />
      <MonthlyReportGrid report={result.report} />
    </>
  );
}
