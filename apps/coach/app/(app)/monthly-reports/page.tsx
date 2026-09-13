import { CalendarCheck } from 'lucide-react';
import { getMyMonthlyReport } from '@/actions/monthlyReportAction';
import { MonthSelector } from './_components/MonthSelector';
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

      {!result.success ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {result.message}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <MonthSelector currentMonth={yearMonth} />

            <div className="flex items-center gap-4 text-sm">
              {result.report.approval?.status === 2 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">
                  <CalendarCheck size={14} />
                  Approved
                  {result.report.approval.approved_at && (
                    <span className="font-normal text-emerald-600">
                      on {new Date(result.report.approval.approved_at).toLocaleDateString('en-US')}
                    </span>
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 border border-slate-200">
                  Not yet reviewed
                </span>
              )}
              <span className="text-slate-500">
                Total sessions: <span className="font-bold text-slate-800">{result.report.grand_total}</span>
              </span>
            </div>
          </div>

          <MonthlyReportGrid report={result.report} />
        </>
      )}
    </div>
  );
}
