import { SessionStatus, SESSION_STATUS } from '@gabby/types/session';

/** English session status labels + badge classes for the Coach portal. */
export const SESSION_STATUS_BADGE: Record<SessionStatus, { label: string; className: string; dotClassName: string }> = {
  [SESSION_STATUS.SCHEDULED]: { label: 'Scheduled', className: 'bg-indigo-50 text-indigo-700 border-indigo-200', dotClassName: 'bg-indigo-500' },
  [SESSION_STATUS.COMPLETED]: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClassName: 'bg-emerald-500' },
  [SESSION_STATUS.CANCELLED_BY_STUDENT]: { label: 'Cancelled by student', className: 'bg-rose-50 text-rose-700 border-rose-200', dotClassName: 'bg-rose-400' },
  [SESSION_STATUS.CANCELLED_BY_COACH]: { label: 'Cancelled by you', className: 'bg-rose-50 text-rose-700 border-rose-200', dotClassName: 'bg-rose-400' },
  [SESSION_STATUS.RESCHEDULED]: { label: 'Rescheduled', className: 'bg-slate-100 text-slate-600 border-slate-200', dotClassName: 'bg-slate-400' },
  [SESSION_STATUS.NO_SHOW]: { label: 'No-show', className: 'bg-amber-50 text-amber-700 border-amber-200', dotClassName: 'bg-amber-500' },
};
