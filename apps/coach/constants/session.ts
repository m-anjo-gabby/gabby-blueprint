import { SESSION_STATUS, COMPLETION_RESULT, CANCEL_CATEGORY, SessionStatus, CompletionResult, CancelCategory } from '@gabby/types/session';

export interface SessionStatusBadge {
  label: string;
  className: string;
  dotClassName: string;
}

const SLATE_BADGE = { className: 'bg-slate-100 text-slate-600 border-slate-200', dotClassName: 'bg-slate-400' };

/** English session status label + badge classes for the Coach portal. */
export function getSessionStatusBadge(session: {
  status: SessionStatus;
  completion_result?: CompletionResult | null;
  cancel_category?: CancelCategory | null;
}): SessionStatusBadge {
  if (session.status === SESSION_STATUS.SCHEDULED) {
    return { label: 'Scheduled', className: 'bg-indigo-50 text-indigo-700 border-indigo-200', dotClassName: 'bg-indigo-500' };
  }
  if (session.status === SESSION_STATUS.COMPLETED) {
    switch (session.completion_result) {
      case COMPLETION_RESULT.EARLY_ENDED:
        return { label: 'Ended early', className: 'bg-orange-50 text-orange-700 border-orange-200', dotClassName: 'bg-orange-500' };
      case COMPLETION_RESULT.NO_SHOW:
        return { label: 'No-show', className: 'bg-amber-50 text-amber-700 border-amber-200', dotClassName: 'bg-amber-500' };
      default:
        return { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClassName: 'bg-emerald-500' };
    }
  }
  // CANCELLED
  switch (session.cancel_category) {
    case CANCEL_CATEGORY.STUDENT:
      return { label: 'Cancelled by student', className: 'bg-rose-50 text-rose-700 border-rose-200', dotClassName: 'bg-rose-400' };
    case CANCEL_CATEGORY.COACH:
      return { label: 'Cancelled by you', className: 'bg-rose-50 text-rose-700 border-rose-200', dotClassName: 'bg-rose-400' };
    case CANCEL_CATEGORY.LICENSE_ENDED:
      return { label: 'Cancelled (license ended)', ...SLATE_BADGE };
    case CANCEL_CATEGORY.COACH_REASSIGNED:
      return { label: 'Cancelled (coach reassigned)', ...SLATE_BADGE };
    default:
      return { label: 'Cancelled', ...SLATE_BADGE };
  }
}
