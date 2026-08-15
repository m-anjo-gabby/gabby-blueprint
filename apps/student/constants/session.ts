import { SessionStatus, SESSION_STATUS } from '@gabby/types/session';

/** 専属コーチマッチング機能のセッションステータスラベル（生徒アプリ用、日本語） */
export const SESSION_STATUS_BADGE: Record<SessionStatus, { label: string; className: string; dotClassName: string }> = {
  [SESSION_STATUS.SCHEDULED]: { label: '予定', className: 'bg-indigo-50 text-indigo-700 border-indigo-100', dotClassName: 'bg-indigo-500' },
  [SESSION_STATUS.COMPLETED]: { label: '実施済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-100', dotClassName: 'bg-emerald-500' },
  [SESSION_STATUS.CANCELLED_BY_STUDENT]: { label: 'キャンセル済み（自分）', className: 'bg-rose-50 text-rose-700 border-rose-100', dotClassName: 'bg-rose-400' },
  [SESSION_STATUS.CANCELLED_BY_COACH]: { label: 'キャンセル済み（コーチ都合）', className: 'bg-rose-50 text-rose-700 border-rose-100', dotClassName: 'bg-rose-400' },
  [SESSION_STATUS.RESCHEDULED]: { label: '振替済み', className: 'bg-slate-100 text-slate-600 border-slate-200', dotClassName: 'bg-slate-400' },
  [SESSION_STATUS.NO_SHOW]: { label: '未参加', className: 'bg-amber-50 text-amber-700 border-amber-100', dotClassName: 'bg-amber-500' },
};
