import { SESSION_STATUS, SessionStatus, CompletionResult, CancelCategory } from '@gabby/types/session';
import { buildSessionStatusBadge, SessionStatusBadgeLabels } from '@gabby/lib/session/sessionStatusBadge';

export interface SessionStatusBadge {
  label: string;
  className: string;
  dotClassName: string;
}

const SLATE_BADGE = { className: 'bg-slate-100 text-slate-600 border-slate-200', dotClassName: 'bg-slate-400' };

const COACH_SESSION_STATUS_LABELS: SessionStatusBadgeLabels<SessionStatusBadge> = {
  scheduled: { label: 'Scheduled', className: 'bg-brand-50 text-brand-strong border-brand-200', dotClassName: 'bg-brand-500' },
  completedNormal: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClassName: 'bg-emerald-500' },
  completedEarlyEnded: { label: 'Ended early', className: 'bg-orange-50 text-orange-700 border-orange-200', dotClassName: 'bg-orange-500' },
  completedNoShow: { label: 'No-show', className: 'bg-amber-50 text-amber-700 border-amber-200', dotClassName: 'bg-amber-500' },
  cancelledByStudent: { label: 'Cancelled by student', className: 'bg-rose-50 text-rose-700 border-rose-200', dotClassName: 'bg-rose-400' },
  cancelledByCoach: { label: 'Cancelled by you', className: 'bg-rose-50 text-rose-700 border-rose-200', dotClassName: 'bg-rose-400' },
  cancelledLicenseEnded: { label: 'Cancelled (license ended)', ...SLATE_BADGE },
  cancelledCoachReassigned: { label: 'Cancelled (coach reassigned)', ...SLATE_BADGE },
  cancelledOther: { label: 'Cancelled', ...SLATE_BADGE },
};

/** SCHEDULEDのまま終了予定時刻を過ぎた（End Session/Resolveがまだ済んでいない）セッション用の
 * 特別バッジ。通常のstatus/completion_result/cancel_categoryのみで決まるbuildSessionStatusBadge
 * （admin/coach/student共通の純粋関数）には時刻の概念を持ち込まず、コーチだけがEnd Session/Resolve
 * を行える＝この状態に対応が必要なのはコーチのみという理由から、コーチ専用ラッパーの側でのみ上書きする。 */
const ACTION_NEEDED_BADGE: SessionStatusBadge = { label: 'Action Needed', className: 'bg-red-50 text-red-700 border-red-200', dotClassName: 'bg-red-500' };

/** English session status label + badge classes for the Coach portal. */
export function getSessionStatusBadge(session: {
  status: SessionStatus;
  completion_result?: CompletionResult | null;
  cancel_category?: CancelCategory | null;
  end_datetime: string;
}): SessionStatusBadge {
  if (session.status === SESSION_STATUS.SCHEDULED && new Date(session.end_datetime).getTime() < Date.now()) {
    return ACTION_NEEDED_BADGE;
  }
  return buildSessionStatusBadge(session, COACH_SESSION_STATUS_LABELS);
}
