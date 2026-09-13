import { MonthlyReportSession } from '@gabby/types/monthlyReport';
import { SESSION_STATUS } from '@gabby/types/session';

/** セッションのステータス表示ラベル（月次コーチングレポートの詳細ダイアログ用） */
export function sessionStatusLabel(session: MonthlyReportSession): string {
  switch (session.status) {
    case SESSION_STATUS.SCHEDULED:
      return session.is_unresolved ? '終了処理未実施' : '予定';
    case SESSION_STATUS.COMPLETED:
      return '完了';
    case SESSION_STATUS.CANCELLED_BY_STUDENT:
      return session.ticket_refunded === false ? '生徒キャンセル（12時間以内）' : '生徒キャンセル';
    case SESSION_STATUS.CANCELLED_BY_COACH:
      return 'コーチキャンセル';
    case SESSION_STATUS.RESCHEDULED:
      return '振替済み';
    case SESSION_STATUS.NO_SHOW:
      return '生徒No show';
    case SESSION_STATUS.EARLY_ENDED:
      return '早期終了';
    case SESSION_STATUS.CANCELLED_LICENSE_ENDED:
      return 'キャンセル（ライセンス無効化）';
    case SESSION_STATUS.CANCELLED_COACH_REASSIGNED:
      return 'キャンセル（コーチ交代）';
    case SESSION_STATUS.CANCELLED_BY_ADMIN:
      return 'アドミン代理キャンセル';
    default:
      return '不明';
  }
}
