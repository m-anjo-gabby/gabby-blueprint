import { CalendarCheck, TriangleAlert } from 'lucide-react';
import { CoachMonthlyReport } from '@gabby/types/monthlyReport';

export function SummaryCard({ report }: { report: CoachMonthlyReport }) {
  const isApproved = report.approval?.status === 2;
  const hasUnresolved = report.unresolved_count > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        {isApproved ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">
            <CalendarCheck size={14} />
            Approved
            {report.approval?.approved_at && (
              <span className="font-normal text-emerald-600">
                on {new Date(report.approval.approved_at).toLocaleDateString('en-US')}
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 border border-slate-200">
            Not yet reviewed
          </span>
        )}

        <span className="text-sm text-slate-500">
          Total sessions: <span className="font-bold text-slate-800">{report.grand_total}</span>
          <span className="text-xs text-slate-400">
            {' '}
            (Completed {report.completed_count} &middot; Late cancel {report.late_cancel_count} &middot; No-show {report.no_show_count})
          </span>
        </span>
      </div>

      {hasUnresolved && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <TriangleAlert size={14} />
          {report.unresolved_count} session{report.unresolved_count > 1 ? 's' : ''} still need to be finalized. Look for the amber cells
          below and complete them — Gabby Academy can&apos;t approve this month until they&apos;re resolved.
        </p>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Session counts are grouped by day using your timezone ({report.coach_timezone}).
      </p>
    </div>
  );
}
