import { getMyMonthlyReport } from '@/actions/monthlyReportAction';
import { getTimezoneNameMap } from '@gabby/lib/timezone/timezoneNames';
import { pickTimezoneName } from '@gabby/lib/date/timezone';
import { SummaryCard } from './SummaryCard';
import { MonthlyReportGrid } from './MonthlyReportGrid';

/**
 * 月次のレポートの本体（要約と表）。
 * page.tsx が月ごとに key を変えた <Suspense> で包み、月の切り替え中に骨組みを出す。
 */
export async function MonthlyReportSection({ yearMonth }: { yearMonth: string }) {
  const [result, timezoneNames] = await Promise.all([getMyMonthlyReport(yearMonth), getTimezoneNameMap()]);

  if (!result.success) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {result.message}
      </div>
    );
  }

  return (
    <>
      <SummaryCard
        report={result.report}
        timezoneName={pickTimezoneName(
          result.report.coach_timezone,
          timezoneNames.get(result.report.coach_timezone),
          'display',
          'en',
        )}
      />
      <MonthlyReportGrid report={result.report} />
    </>
  );
}
