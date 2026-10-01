import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import type { ResumeContentResponse } from '@gabby/types/training';

export type TodayFocus =
  | { kind: 'assignment'; assignment: DialogueAssignmentSummary }
  | { kind: 'resume'; resume: ResumeContentResponse }
  | { kind: 'start' };

interface ResolveTodayFocusInput {
  assignments: DialogueAssignmentSummary[];
  /** 途中の教材の再開情報（ブックマーク） */
  resume: ResumeContentResponse | null;
}

/**
 * ホームの「今日やること」に表示する主役を1つだけ決める。
 * 自主トレーニングの案内に限る（ライブセッションはホームの「ライブセッション」のカードが受け持つ）。
 * 優先順位: コーチからの未完了の課題 > 途中の教材の再開 > 学習開始の案内（暫定。今後コーチ・AIの計画に置き換える想定）
 * 再開が課題に譲った場合は、補助カード「続きから」に表示する。
 */
export function resolveTodayFocus({ assignments, resume }: ResolveTodayFocusInput): TodayFocus {
  const pendingAssignment = assignments.find((a) => !a.is_set_completed);
  if (pendingAssignment) {
    return { kind: 'assignment', assignment: pendingAssignment };
  }

  if (resume) {
    return { kind: 'resume', resume };
  }

  return { kind: 'start' };
}
