import { getLocale } from 'next-intl/server';
import { pickTimezoneName } from '@gabby/lib/date/timezone';
import { getTimezoneNameMap } from '@gabby/lib/timezone/timezoneNames';
import { getCoachMonthlyReportForAdmin } from '@/actions/adminMonthlyReportAction';
import { ApprovalControlBar } from './ApprovalControlBar';
import { ExportCsvButton } from './ExportCsvButton';
import { InvoiceDownloadButton } from './InvoiceDownloadButton';
import { MonthlyReportGrid } from './MonthlyReportGrid';

interface MonthlyReportSectionProps {
  coachId: string;
  yearMonth: string;
  coachName: string;
}

/**
 * 月次レポート本体（承認バー・出力ボタン・明細グリッド）。
 * page.tsx がコーチ・月ごとに key を変えた <Suspense> で包み、切り替え時に骨組みを表示する。
 */
export async function MonthlyReportSection({ coachId, yearMonth, coachName }: MonthlyReportSectionProps) {
  const [result, timezoneNames, locale] = await Promise.all([
    getCoachMonthlyReportForAdmin(coachId, yearMonth),
    getTimezoneNameMap(),
    getLocale(),
  ]);

  if (!result.success) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {result.message}
      </div>
    );
  }

  return (
    <>
      <ApprovalControlBar
        coachId={coachId}
        reportMonth={yearMonth}
        report={result.report}
        coachTimezoneName={pickTimezoneName(
          result.report.coach_timezone,
          timezoneNames.get(result.report.coach_timezone),
          'display',
          locale === 'en' ? 'en' : 'ja',
        )}
      />
      <div className="flex justify-end gap-2">
        {result.report.approval?.status === 2 && (
          <InvoiceDownloadButton coachId={coachId} reportMonth={result.report.report_month} />
        )}
        <ExportCsvButton report={result.report} coachName={coachName} />
      </div>
      <MonthlyReportGrid report={result.report} />
    </>
  );
}
