import { SESSION_STATUS, COMPLETION_RESULT, CANCEL_CATEGORY, SessionStatus, CompletionResult, CancelCategory } from '@gabby/types/session';

export interface SessionStatusBadge {
  label: string;
  className: string;
  dotClassName: string;
}

const SLATE_BADGE = { className: 'bg-slate-100 text-slate-600 border-slate-200', dotClassName: 'bg-slate-400' };

/** 専属コーチマッチング機能のセッションステータスラベル（生徒アプリ用、日本語） */
export function getSessionStatusBadge(session: {
  status: SessionStatus;
  completion_result?: CompletionResult | null;
  cancel_category?: CancelCategory | null;
}): SessionStatusBadge {
  if (session.status === SESSION_STATUS.SCHEDULED) {
    return { label: '予定', className: 'bg-indigo-50 text-indigo-700 border-indigo-100', dotClassName: 'bg-indigo-500' };
  }
  if (session.status === SESSION_STATUS.COMPLETED) {
    switch (session.completion_result) {
      case COMPLETION_RESULT.EARLY_ENDED:
        return { label: '早期終了', className: 'bg-orange-50 text-orange-700 border-orange-100', dotClassName: 'bg-orange-500' };
      case COMPLETION_RESULT.NO_SHOW:
        return { label: '未参加', className: 'bg-amber-50 text-amber-700 border-amber-100', dotClassName: 'bg-amber-500' };
      default:
        return { label: '実施済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-100', dotClassName: 'bg-emerald-500' };
    }
  }
  // CANCELLED
  switch (session.cancel_category) {
    case CANCEL_CATEGORY.STUDENT:
      return { label: 'キャンセル済み（自分）', className: 'bg-rose-50 text-rose-700 border-rose-100', dotClassName: 'bg-rose-400' };
    case CANCEL_CATEGORY.COACH:
      return { label: 'キャンセル済み（コーチ都合）', className: 'bg-rose-50 text-rose-700 border-rose-100', dotClassName: 'bg-rose-400' };
    case CANCEL_CATEGORY.LICENSE_ENDED:
      return { label: 'キャンセル済み（契約終了）', ...SLATE_BADGE };
    case CANCEL_CATEGORY.COACH_REASSIGNED:
      return { label: 'キャンセル済み（コーチ交代）', ...SLATE_BADGE };
    default:
      return { label: 'キャンセル済み', ...SLATE_BADGE };
  }
}
