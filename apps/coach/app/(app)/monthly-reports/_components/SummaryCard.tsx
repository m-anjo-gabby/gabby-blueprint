import { CalendarCheck, Download, TriangleAlert } from 'lucide-react';
import { formatDateEn } from '@gabby/lib/date/dateEn';
import { getApprovedCounts, getCurrentCounts } from '@gabby/lib/monthlyReport/reportCounts';
import { type CoachMonthlyReport } from '@gabby/types/monthlyReport';

/** timezoneName: コーチのタイムゾーンのマスタの表示名（例: "Japan (Tokyo)"） */
export function SummaryCard({ report, timezoneName }: { report: CoachMonthlyReport; timezoneName: string }) {
  const isApproved = report.approval?.status === 2;
  const hasUnresolved = report.unresolved_count > 0;
  // 承認済みの月は支払通知書と同じ承認時点の件数を出す
  const counts = getApprovedCounts(report.approval) ?? getCurrentCounts(report);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        {isApproved ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">
            <CalendarCheck size={14} />
            Approved
            {report.approval?.approved_at && (
              <span className="font-normal text-emerald-600">
                on {formatDateEn(report.approval.approved_at, report.coach_timezone)}
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 border border-slate-200">
            Not yet reviewed
          </span>
        )}

        <span className="text-sm text-slate-500">
          Total sessions: <span className="font-bold text-slate-800">{counts.total}</span>
          <span className="text-xs text-slate-400">
            {' '}
            (Completed {counts.completed} &middot; Late cancel {counts.late_cancel} &middot; No-show {counts.no_show})
          </span>
        </span>

        {isApproved && (
          <a
            href={`/api/monthly-reports/pay-notice?month=${report.report_month}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Download size={14} />
            Download Pay Notice (PDF)
          </a>
        )}
      </div>

      {hasUnresolved && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <TriangleAlert size={14} />
          {report.unresolved_count} session{report.unresolved_count > 1 ? 's' : ''} still need to be finalized. Look for
          the amber cells below and complete them — Gabby Academy can&apos;t approve this month until they&apos;re
          resolved.
        </p>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Session counts are grouped by day using your timezone ({timezoneName}).
      </p>
    </div>
  );
}
