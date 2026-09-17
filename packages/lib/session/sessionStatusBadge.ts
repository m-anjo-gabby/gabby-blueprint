import { SESSION_STATUS, COMPLETION_RESULT, CANCEL_CATEGORY, SessionStatus, CompletionResult, CancelCategory } from '@gabby/types/session';

export interface SessionStatusBadgeStyle {
  label: string;
  className: string;
  dotClassName?: string;
}

/**
 * status/completion_result/cancel_categoryの3軸から表示バッジを一意に決める分岐ロジック。
 * admin/coach/studentの3アプリで完全に同一だった分岐を集約したもので、文言・配色は
 * 一切ハードコードしない（CLAUDE.md 5章のアプリ別UI言語方針に従い、呼び出し側がlabelsとして注入する）。
 */
export interface SessionStatusBadgeLabels<T extends SessionStatusBadgeStyle = SessionStatusBadgeStyle> {
  scheduled: T;
  completedNormal: T;
  completedEarlyEnded: T;
  completedNoShow: T;
  cancelledByStudent: T;
  cancelledByCoach: T;
  cancelledLicenseEnded: T;
  cancelledCoachReassigned: T;
  /** cancel_categoryがADMIN、またはnull/未知の値の場合のフォールバック */
  cancelledOther: T;
}

export function buildSessionStatusBadge<T extends SessionStatusBadgeStyle>(
  session: {
    status: SessionStatus;
    completion_result?: CompletionResult | null;
    cancel_category?: CancelCategory | null;
  },
  labels: SessionStatusBadgeLabels<T>
): T {
  if (session.status === SESSION_STATUS.SCHEDULED) {
    return labels.scheduled;
  }
  if (session.status === SESSION_STATUS.COMPLETED) {
    switch (session.completion_result) {
      case COMPLETION_RESULT.EARLY_ENDED:
        return labels.completedEarlyEnded;
      case COMPLETION_RESULT.NO_SHOW:
        return labels.completedNoShow;
      default:
        return labels.completedNormal;
    }
  }
  // CANCELLED
  switch (session.cancel_category) {
    case CANCEL_CATEGORY.STUDENT:
      return labels.cancelledByStudent;
    case CANCEL_CATEGORY.COACH:
      return labels.cancelledByCoach;
    case CANCEL_CATEGORY.LICENSE_ENDED:
      return labels.cancelledLicenseEnded;
    case CANCEL_CATEGORY.COACH_REASSIGNED:
      return labels.cancelledCoachReassigned;
    default:
      return labels.cancelledOther;
  }
}
