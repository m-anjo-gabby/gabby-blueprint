import { SessionStatus, SESSION_STATUS } from '@gabby/types/session';

/**
 * ライブセッション管理画面用のステータスラベル（アドミン向け、日本語）。
 * コーチ・生徒向けの表示とは異なり、運用判断のためにキャンセル・振替系も含めた
 * 全ステータスをそのまま見せる（非表示にする加工はしない）。
 */
export const ADMIN_SESSION_STATUS_BADGE: Record<SessionStatus, { label: string; className: string }> = {
  [SESSION_STATUS.SCHEDULED]: { label: '予定', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  [SESSION_STATUS.COMPLETED]: { label: '実施済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  [SESSION_STATUS.CANCELLED_BY_STUDENT]: { label: 'キャンセル（生徒）', className: 'bg-rose-50 text-rose-700 border-rose-100' },
  [SESSION_STATUS.CANCELLED_BY_COACH]: { label: 'キャンセル（コーチ）', className: 'bg-rose-50 text-rose-700 border-rose-100' },
  [SESSION_STATUS.RESCHEDULED]: { label: '振替済み', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  [SESSION_STATUS.NO_SHOW]: { label: '未参加', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  [SESSION_STATUS.EARLY_ENDED]: { label: '早期終了', className: 'bg-orange-50 text-orange-700 border-orange-100' },
  [SESSION_STATUS.CANCELLED_LICENSE_ENDED]: { label: 'キャンセル（契約終了）', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  [SESSION_STATUS.CANCELLED_COACH_REASSIGNED]: { label: 'キャンセル（コーチ交代）', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/** com_m_lesson_schedule.status のラベル（アドミン向け、日本語） */
export const ADMIN_SCHEDULE_STATUS_LABEL: Record<number, { label: string; className: string }> = {
  1: { label: '稼働中', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  0: { label: '一時停止', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  9: { label: '終了済み', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};
