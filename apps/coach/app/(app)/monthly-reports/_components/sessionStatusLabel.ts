import { MonthlyReportSession } from '@gabby/types/monthlyReport';
import { SESSION_STATUS, COMPLETION_RESULT, CANCEL_CATEGORY } from '@gabby/types/session';

/** Short English label for a session's status, for the Monthly Report detail dialog */
export function sessionStatusLabel(session: MonthlyReportSession): string {
  if (session.status === SESSION_STATUS.SCHEDULED) {
    return session.is_unresolved ? 'Not finalized yet' : 'Scheduled';
  }
  if (session.status === SESSION_STATUS.COMPLETED) {
    switch (session.completion_result) {
      case COMPLETION_RESULT.EARLY_ENDED:
        return 'Ended early';
      case COMPLETION_RESULT.NO_SHOW:
        return 'Student no-show';
      default:
        return 'Completed';
    }
  }
  // CANCELLED
  switch (session.cancel_category) {
    case CANCEL_CATEGORY.STUDENT:
      return session.ticket_refunded === false ? 'Cancelled by student (within 12h)' : 'Cancelled by student';
    case CANCEL_CATEGORY.COACH:
      return 'Cancelled by you';
    case CANCEL_CATEGORY.LICENSE_ENDED:
      return 'Cancelled (license ended)';
    case CANCEL_CATEGORY.COACH_REASSIGNED:
      return 'Cancelled (coach reassigned)';
    case CANCEL_CATEGORY.ADMIN:
      return 'Cancelled by admin';
    default:
      return 'Unknown';
  }
}
