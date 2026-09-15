import { SessionStatus, CompletionResult, CancelCategory } from '@gabby/types/session';
import { buildSessionStatusBadge, SessionStatusBadgeLabels } from '@gabby/lib/session/sessionStatusBadge';

export interface SessionStatusBadge {
  label: string;
  className: string;
  dotClassName: string;
}

const SLATE_BADGE = { className: 'bg-slate-100 text-slate-600 border-slate-200', dotClassName: 'bg-slate-400' };

const STUDENT_SESSION_STATUS_LABELS: SessionStatusBadgeLabels<SessionStatusBadge> = {
  scheduled: { label: '予定', className: 'bg-indigo-50 text-indigo-700 border-indigo-100', dotClassName: 'bg-indigo-500' },
  completedNormal: { label: '実施済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-100', dotClassName: 'bg-emerald-500' },
  completedEarlyEnded: { label: '早期終了', className: 'bg-orange-50 text-orange-700 border-orange-100', dotClassName: 'bg-orange-500' },
  completedNoShow: { label: '未参加', className: 'bg-amber-50 text-amber-700 border-amber-100', dotClassName: 'bg-amber-500' },
  cancelledByStudent: { label: 'キャンセル済み（自分）', className: 'bg-rose-50 text-rose-700 border-rose-100', dotClassName: 'bg-rose-400' },
  cancelledByCoach: { label: 'キャンセル済み（コーチ都合）', className: 'bg-rose-50 text-rose-700 border-rose-100', dotClassName: 'bg-rose-400' },
  cancelledLicenseEnded: { label: 'キャンセル済み（契約終了）', ...SLATE_BADGE },
  cancelledCoachReassigned: { label: 'キャンセル済み（コーチ交代）', ...SLATE_BADGE },
  cancelledOther: { label: 'キャンセル済み', ...SLATE_BADGE },
};

/** 専属コーチマッチング機能のセッションステータスラベル（生徒アプリ用、日本語） */
export function getSessionStatusBadge(session: {
  status: SessionStatus;
  completion_result?: CompletionResult | null;
  cancel_category?: CancelCategory | null;
}): SessionStatusBadge {
  return buildSessionStatusBadge(session, STUDENT_SESSION_STATUS_LABELS);
}
