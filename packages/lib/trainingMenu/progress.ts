import type { SprintQuestionType } from '@gabby/types/sprint';
import { TRAINING_MENU_ITEM_TYPE, type TrainingMenuItemType } from '@gabby/types/trainingMenu';

/** 完了の判定に使う、やること1件の形（student_t_training_menu_item の一部） */
export interface TrainingMenuItemTarget {
  item_type: TrainingMenuItemType;
  content_id: string;
  video_id: string | null;
  question_type: SprintQuestionType | null;
  difficulty_level: number | null;
  target_count: number;
}

/** その日の実績（各トレーニングの記録から集めたもの） */
export interface TrainingMenuFacts {
  /** その日（生徒のタイムゾーン）のタイムアタックの回数。キーは sprintSessionKey */
  sprintSessionCounts: ReadonlyMap<string, number>;
  /** 最後まで見たビデオのID */
  completedVideoIds: ReadonlySet<string>;
}

export interface TrainingMenuItemProgress {
  /** 済んだ回数（target_count を上限にする） */
  doneCount: number;
  isCompleted: boolean;
}

/** タイムアタックの回数を数えるキー（教材・種別・レベルが同じものだけを数える） */
export const sprintSessionKey = (contentId: string, questionType: string, level: number): string =>
  `${contentId}:${questionType}:${level}`;

/** やること1件の進み具合を、その日の実績から求める */
export function resolveTrainingMenuItemProgress(
  item: TrainingMenuItemTarget,
  facts: TrainingMenuFacts,
): TrainingMenuItemProgress {
  if (item.item_type === TRAINING_MENU_ITEM_TYPE.VIDEO) {
    const isCompleted = item.video_id !== null && facts.completedVideoIds.has(item.video_id);
    return { doneCount: isCompleted ? 1 : 0, isCompleted };
  }
  if (item.question_type === null || item.difficulty_level === null) {
    return { doneCount: 0, isCompleted: false };
  }
  const count = facts.sprintSessionCounts.get(
    sprintSessionKey(item.content_id, item.question_type, item.difficulty_level),
  );
  const doneCount = Math.min(count ?? 0, item.target_count);
  return { doneCount, isCompleted: doneCount >= item.target_count };
}
