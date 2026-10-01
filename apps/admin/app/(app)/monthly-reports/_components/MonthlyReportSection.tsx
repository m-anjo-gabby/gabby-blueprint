import { getCoachMonthlyReportForAdmin } from '@/actions/adminMonthlyReportAction';
import { ApprovalControlBar } from './ApprovalControlBar';
import { MonthlyReportGrid } from './MonthlyReportGrid';
import { ExportCsvButton } from './ExportCsvButton';
import { InvoiceDownloadButton } from './InvoiceDownloadButton';

interface Props {
  coachId: string;
  yearMonth: string;
  coachName: string;
}

/**
 * 月次レポート本体（承認バー・出力ボタン・明細グリッド）。
 * page.tsx がコーチ・月ごとに key を変えた <Suspense> で包み、切り替え時に骨組みを表示する。
 */
export async function MonthlyReportSection({ coachId, yearMonth, coachName }: Props) {
  const result = await getCoachMonthlyReportForAdmin(coachId, yearMonth);

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
        grandTotal={result.report.grand_total}
        completedCount={result.report.completed_count}
        lateCancelCount={result.report.late_cancel_count}
        noShowCount={result.report.no_show_count}
        unresolvedCount={result.report.unresolved_count}
        coachTimezone={result.report.coach_timezone}
        approval={result.report.approval}
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
