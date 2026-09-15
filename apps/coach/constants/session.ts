import { SessionStatus, CompletionResult, CancelCategory } from '@gabby/types/session';
import { buildSessionStatusBadge, SessionStatusBadgeLabels } from '@gabby/lib/session/sessionStatusBadge';

export interface SessionStatusBadge {
  label: string;
  className: string;
  dotClassName: string;
}

const SLATE_BADGE = { className: 'bg-slate-100 text-slate-600 border-slate-200', dotClassName: 'bg-slate-400' };

const COACH_SESSION_STATUS_LABELS: SessionStatusBadgeLabels<SessionStatusBadge> = {
  scheduled: { label: 'Scheduled', className: 'bg-indigo-50 text-indigo-700 border-indigo-200', dotClassName: 'bg-indigo-500' },
  completedNormal: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClassName: 'bg-emerald-500' },
  completedEarlyEnded: { label: 'Ended early', className: 'bg-orange-50 text-orange-700 border-orange-200', dotClassName: 'bg-orange-500' },
  completedNoShow: { label: 'No-show', className: 'bg-amber-50 text-amber-700 border-amber-200', dotClassName: 'bg-amber-500' },
  cancelledByStudent: { label: 'Cancelled by student', className: 'bg-rose-50 text-rose-700 border-rose-200', dotClassName: 'bg-rose-400' },
  cancelledByCoach: { label: 'Cancelled by you', className: 'bg-rose-50 text-rose-700 border-rose-200', dotClassName: 'bg-rose-400' },
  cancelledLicenseEnded: { label: 'Cancelled (license ended)', ...SLATE_BADGE },
  cancelledCoachReassigned: { label: 'Cancelled (coach reassigned)', ...SLATE_BADGE },
  cancelledOther: { label: 'Cancelled', ...SLATE_BADGE },
};

/** English session status label + badge classes for the Coach portal. */
export function getSessionStatusBadge(session: {
  status: SessionStatus;
  completion_result?: CompletionResult | null;
  cancel_category?: CancelCategory | null;
}): SessionStatusBadge {
  return buildSessionStatusBadge(session, COACH_SESSION_STATUS_LABELS);
}
