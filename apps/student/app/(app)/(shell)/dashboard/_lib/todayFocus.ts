import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS } from '@gabby/lib/liveSessionRoom/constants';
import type { SessionListItem } from '@gabby/types/session';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import type { ResumeContentResponse } from '@gabby/types/training';

/** 次回ライブセッションを「今日やること」として最優先表示し始める、開始前の時間 */
export const SESSION_FOCUS_LEAD_MS = 24 * 60 * 60 * 1000;

export type TodayFocus =
  | { kind: 'session'; session: SessionListItem; canJoin: boolean }
  | { kind: 'assignment'; assignment: DialogueAssignmentSummary }
  | { kind: 'resume'; resume: ResumeContentResponse }
  | { kind: 'start' };

interface ResolveTodayFocusInput {
  nextSession: SessionListItem | null;
  assignments: DialogueAssignmentSummary[];
  /** 途中の教材の再開情報（ブックマーク） */
  resume: ResumeContentResponse | null;
  nowMs: number;
}

/**
 * ホームの「今日やること」に表示する主役を1つだけ決める。
 * 優先順位: 開始が近いライブセッション > コーチからの未完了の課題 > 途中の教材の再開 > 学習開始の案内
 * 再開がセッション・課題に譲った場合は、補助カード「続きから」に表示する。
 */
export function resolveTodayFocus({ nextSession, assignments, resume, nowMs }: ResolveTodayFocusInput): TodayFocus {
  if (nextSession) {
    const startMs = new Date(nextSession.start_datetime).getTime();
    const endMs = new Date(nextSession.end_datetime).getTime();
    if (startMs - nowMs <= SESSION_FOCUS_LEAD_MS && nowMs <= endMs) {
      return { kind: 'session', session: nextSession, canJoin: nowMs >= startMs - LIVE_SESSION_EARLY_JOIN_BEFORE_MS };
    }
  }

  const pendingAssignment = assignments.find((a) => !a.is_set_completed);
  if (pendingAssignment) {
    return { kind: 'assignment', assignment: pendingAssignment };
  }

  if (resume) {
    return { kind: 'resume', resume };
  }

  return { kind: 'start' };
}
