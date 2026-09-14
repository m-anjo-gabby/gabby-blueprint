import { SessionStatus, CompletionResult, CancelCategory, SESSION_STATUS, COMPLETION_RESULT, CANCEL_CATEGORY } from '@gabby/types/session';

const SLATE_BADGE = { className: 'bg-slate-100 text-slate-500 border-slate-200' };

/**
 * ライブセッション管理画面用のステータスラベル（アドミン向け、日本語）。
 * コーチ・生徒向けの表示とは異なり、運用判断のためにキャンセルの起因も含めた
 * 内訳をそのまま見せる（非表示にする加工はしない）。
 */
export function getAdminSessionStatusBadge(session: {
  status: SessionStatus;
  completion_result?: CompletionResult | null;
  cancel_category?: CancelCategory | null;
}): { label: string; className: string } {
  if (session.status === SESSION_STATUS.SCHEDULED) {
    return { label: '予定', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' };
  }
  if (session.status === SESSION_STATUS.COMPLETED) {
    switch (session.completion_result) {
      case COMPLETION_RESULT.EARLY_ENDED:
        return { label: '早期終了', className: 'bg-orange-50 text-orange-700 border-orange-100' };
      case COMPLETION_RESULT.NO_SHOW:
        return { label: '未参加', className: 'bg-amber-50 text-amber-700 border-amber-100' };
      default:
        return { label: '実施済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    }
  }
  // CANCELLED
  switch (session.cancel_category) {
    case CANCEL_CATEGORY.STUDENT:
      return { label: 'キャンセル（生徒）', className: 'bg-rose-50 text-rose-700 border-rose-100' };
    case CANCEL_CATEGORY.COACH:
      return { label: 'キャンセル（コーチ）', className: 'bg-rose-50 text-rose-700 border-rose-100' };
    case CANCEL_CATEGORY.LICENSE_ENDED:
      return { label: 'キャンセル（契約終了）', ...SLATE_BADGE };
    case CANCEL_CATEGORY.COACH_REASSIGNED:
      return { label: 'キャンセル（コーチ交代）', ...SLATE_BADGE };
    default:
      return { label: 'キャンセル（アドミン代理）', ...SLATE_BADGE };
  }
}

/** com_m_lesson_schedule.status のラベル（アドミン向け、日本語） */
export const ADMIN_SCHEDULE_STATUS_LABEL: Record<number, { label: string; className: string }> = {
  1: { label: '稼働中', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  0: { label: '一時停止', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  9: { label: '終了済み', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};
