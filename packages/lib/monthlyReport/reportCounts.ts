import {
  MONTHLY_REPORT_APPROVAL_STATUS,
  type CoachMonthlyReport,
  type MonthlyReportApproval,
  type MonthlyReportCounts,
} from '@gabby/types/monthlyReport';

/**
 * 承認済みの月の、承認時点の件数と内訳。請求書・支払通知書（PDF）と承認済みの表示はこの値を使い、
 * 承認後に実施結果を直しても変わらない（変えるには承認を取り消して承認し直す）。
 * 未承認・スナップショットが無い場合は null。
 */
export function getApprovedCounts(approval: MonthlyReportApproval | null): MonthlyReportCounts | null {
  const snapshot =
    approval?.status === MONTHLY_REPORT_APPROVAL_STATUS.APPROVED ? approval.session_count_snapshot : null;
  if (!snapshot) return null;
  return {
    total: snapshot.total,
    completed: snapshot.completed,
    late_cancel: snapshot.late_cancel,
    no_show: snapshot.no_show,
  };
}

/** 今のセッションの記録から数えた件数と内訳 */
export function getCurrentCounts(report: CoachMonthlyReport): MonthlyReportCounts {
  return {
    total: report.grand_total,
    completed: report.completed_count,
    late_cancel: report.late_cancel_count,
    no_show: report.no_show_count,
  };
}

/** 承認時点から件数・内訳のどれかが変わったか（承認後の実施結果の修正に気付けるようにする） */
export function hasCountsChanged(approved: MonthlyReportCounts, current: MonthlyReportCounts): boolean {
  return (
    approved.total !== current.total ||
    approved.completed !== current.completed ||
    approved.late_cancel !== current.late_cancel ||
    approved.no_show !== current.no_show
  );
}

/**
 * 対象月が今月より後か。承認の関数（approve_coach_monthly_report）と同じく、コーチのタイムゾーンの今日で判定する。
 * @param reportMonth 対象月（"YYYY-MM-01"）
 * @param today コーチのタイムゾーンでの今日（"YYYY-MM-DD"）
 */
export function isFutureReportMonth(reportMonth: string, today: string): boolean {
  return reportMonth.slice(0, 7) > today.slice(0, 7);
}
