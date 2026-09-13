import { MonthlyReportSession } from '@gabby/types/monthlyReport';
import { SESSION_STATUS } from '@gabby/types/session';

/** Short English label for a session's status, for the Monthly Report detail dialog */
export function sessionStatusLabel(session: MonthlyReportSession): string {
  switch (session.status) {
    case SESSION_STATUS.SCHEDULED:
      return session.is_unresolved ? 'Not finalized yet' : 'Scheduled';
    case SESSION_STATUS.COMPLETED:
      return 'Completed';
    case SESSION_STATUS.CANCELLED_BY_STUDENT:
      return session.ticket_refunded === false ? 'Cancelled by student (within 12h)' : 'Cancelled by student';
    case SESSION_STATUS.CANCELLED_BY_COACH:
      return 'Cancelled by you';
    case SESSION_STATUS.RESCHEDULED:
      return 'Rescheduled';
    case SESSION_STATUS.NO_SHOW:
      return 'Student no-show';
    case SESSION_STATUS.EARLY_ENDED:
      return 'Ended early';
    case SESSION_STATUS.CANCELLED_LICENSE_ENDED:
      return 'Cancelled (license ended)';
    case SESSION_STATUS.CANCELLED_COACH_REASSIGNED:
      return 'Cancelled (coach reassigned)';
    case SESSION_STATUS.CANCELLED_BY_ADMIN:
      return 'Cancelled by admin';
    default:
      return 'Unknown';
  }
}
