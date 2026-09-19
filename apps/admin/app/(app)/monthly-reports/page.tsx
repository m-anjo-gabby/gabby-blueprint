import { getCoachesForMonthlyReport, getCoachMonthlyReportForAdmin } from '@/actions/adminMonthlyReportAction';
import { CoachMonthSelector } from './_components/CoachMonthSelector';
import { ApprovalControlBar } from './_components/ApprovalControlBar';
import { MonthlyReportGrid } from './_components/MonthlyReportGrid';
import { ExportCsvButton } from './_components/ExportCsvButton';
import { InvoiceDownloadButton } from './_components/InvoiceDownloadButton';

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default async function AdminMonthlyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ coachId?: string; month?: string }>;
}) {
  const params = await searchParams;
  const coaches = await getCoachesForMonthlyReport();
  const coachId = params.coachId || coaches[0]?.id || '';
  const yearMonth = params.month || currentYearMonth();

  const result = coachId ? await getCoachMonthlyReportForAdmin(coachId, yearMonth) : null;
  const coachName = coaches.find((c) => c.id === coachId)?.user_name ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">月次コーチングレポート</h1>
        <p className="text-xs text-slate-500 mt-1">
          コーチ毎・月毎のライブセッション実施状況を確認し、稼働を承認します。
        </p>
      </div>

      <CoachMonthSelector coaches={coaches} currentCoachId={coachId} currentMonth={yearMonth} />

      {!coachId ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
          コーチが登録されていません。
        </div>
      ) : !result?.success ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {result?.message}
        </div>
      ) : (
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
      )}
    </div>
  );
}
