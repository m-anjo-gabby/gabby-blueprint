import { getMyMonthlyReport } from '@/actions/monthlyReportAction';
import { MonthSelector } from './_components/MonthSelector';
import { SummaryCard } from './_components/SummaryCard';
import { MonthlyReportGrid } from './_components/MonthlyReportGrid';

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

  const result = await getMyMonthlyReport(yearMonth);

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

      {!result.success ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {result.message}
        </div>
      ) : (
        <>
          <SummaryCard report={result.report} />
          <MonthlyReportGrid report={result.report} />
        </>
      )}
    </div>
  );
}
