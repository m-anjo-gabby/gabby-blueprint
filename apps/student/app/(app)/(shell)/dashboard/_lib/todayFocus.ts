import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS } from '@gabby/lib/liveSessionRoom/constants';
import type { SessionListItem } from '@gabby/types/session';
import type { ResumeContentResponse } from '@gabby/types/training';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';

/** 次回ライブセッションを「今日やること」として最優先表示し始める、開始前の時間 */
export const SESSION_FOCUS_LEAD_MS = 24 * 60 * 60 * 1000;

export type TodayFocus =
  | { kind: 'session'; session: SessionListItem; canJoin: boolean }
  | { kind: 'resume'; resume: ResumeContentResponse }
  | { kind: 'assignment'; assignment: DialogueAssignmentSummary }
  | { kind: 'start' };

interface ResolveTodayFocusInput {
  nextSession: SessionListItem | null;
  resume: ResumeContentResponse | null;
  assignments: DialogueAssignmentSummary[];
  nowMs: number;
}

/**
 * ホームの「今日やること」に表示する主役を1つだけ決める。
 * 優先順位: 開始が近いライブセッション > 途中の教材の再開 > コーチからの未完了の課題 > 学習開始の案内
 */
export function resolveTodayFocus({ nextSession, resume, assignments, nowMs }: ResolveTodayFocusInput): TodayFocus {
  if (nextSession) {
    const startMs = new Date(nextSession.start_datetime).getTime();
    const endMs = new Date(nextSession.end_datetime).getTime();
    if (startMs - nowMs <= SESSION_FOCUS_LEAD_MS && nowMs <= endMs) {
      return { kind: 'session', session: nextSession, canJoin: nowMs >= startMs - LIVE_SESSION_EARLY_JOIN_BEFORE_MS };
    }
  }

  // 参照先の教材が不可視・削除済みのブックマークは対象外
  if (resume?.com_m_contents) {
    return { kind: 'resume', resume };
  }

  const pendingAssignment = assignments.find((a) => !a.is_set_completed);
  if (pendingAssignment) {
    return { kind: 'assignment', assignment: pendingAssignment };
  }

  return { kind: 'start' };
}
