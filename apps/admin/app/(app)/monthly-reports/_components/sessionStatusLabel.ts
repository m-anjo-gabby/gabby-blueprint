import type { useTranslations } from 'next-intl';
import { MonthlyReportSession } from '@gabby/types/monthlyReport';
import { SESSION_STATUS, COMPLETION_RESULT, CANCEL_CATEGORY } from '@gabby/types/session';

type StatusT = ReturnType<typeof useTranslations<'monthlyReports.status'>>;

/** セッションのステータス表示ラベル（月次コーチングレポートの詳細ダイアログ用） */
export function sessionStatusLabel(session: MonthlyReportSession, t: StatusT): string {
  if (session.status === SESSION_STATUS.SCHEDULED) {
    return session.is_unresolved ? t('unresolved') : t('scheduled');
  }
  if (session.status === SESSION_STATUS.COMPLETED) {
    switch (session.completion_result) {
      case COMPLETION_RESULT.EARLY_ENDED:
        return t('earlyEnded');
      case COMPLETION_RESULT.NO_SHOW:
        return t('noShow');
      default:
        return t('completed');
    }
  }
  // CANCELLED
  switch (session.cancel_category) {
    case CANCEL_CATEGORY.STUDENT:
      return session.ticket_refunded === false ? t('studentCancelLate') : t('studentCancel');
    case CANCEL_CATEGORY.COACH:
      return t('coachCancel');
    case CANCEL_CATEGORY.LICENSE_ENDED:
      return t('licenseCancelled');
    case CANCEL_CATEGORY.COACH_REASSIGNED:
      return t('coachReassignedCancelled');
    case CANCEL_CATEGORY.ADMIN:
      return t('adminCancel');
    default:
      return t('unknown');
  }
}
