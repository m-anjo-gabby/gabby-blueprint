import { MonthlyReportSession } from '@gabby/types/monthlyReport';
import { SESSION_STATUS, COMPLETION_RESULT, CANCEL_CATEGORY } from '@gabby/types/session';

/** セッションのステータス表示ラベル（月次コーチングレポートの詳細ダイアログ用） */
export function sessionStatusLabel(session: MonthlyReportSession): string {
  if (session.status === SESSION_STATUS.SCHEDULED) {
    return session.is_unresolved ? '終了処理未実施' : '予定';
  }
  if (session.status === SESSION_STATUS.COMPLETED) {
    switch (session.completion_result) {
      case COMPLETION_RESULT.EARLY_ENDED:
        return '早期終了';
      case COMPLETION_RESULT.NO_SHOW:
        return '生徒No show';
      default:
        return '完了';
    }
  }
  // CANCELLED
  switch (session.cancel_category) {
    case CANCEL_CATEGORY.STUDENT:
      return session.ticket_refunded === false ? '生徒キャンセル（12時間以内）' : '生徒キャンセル';
    case CANCEL_CATEGORY.COACH:
      return 'コーチキャンセル';
    case CANCEL_CATEGORY.LICENSE_ENDED:
      return 'キャンセル（ライセンス無効化）';
    case CANCEL_CATEGORY.COACH_REASSIGNED:
      return 'キャンセル（コーチ交代）';
    case CANCEL_CATEGORY.ADMIN:
      return 'アドミン代理キャンセル';
    default:
      return '不明';
  }
}
