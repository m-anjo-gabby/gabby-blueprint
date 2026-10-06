import { z } from 'zod';

/**
 * スプリント実施履歴（self_t_sprint / lesson_t_sprint の answered_history JSONB）の検証と読み込み。
 * answered_history は「問題1件=配列の1要素」で、DB側は CHECK 制約で配列であることだけを保証する。
 * 要素の形は保存前にここで検証する（サーバーアクションは誰でも呼べるため、壊れた・巨大な配列を保存させない）。
 */

/** 1回のスプリントで保存できる問題数の上限（実際の出題数より十分大きい値。異常なペイロードを弾くため） */
export const SPRINT_HISTORY_MAX_ITEMS = 1000;

const historyItemBase = {
  question_id: z.string().min(1),
  group_id: z.string().nullable(),
  seq_no: z.number().int().positive(),
  is_skipped: z.boolean(),
};

/**
 * 自主トレスプリントの履歴1件。
 * assessment.analysis は結果画面の表示用の詳細で、項目を増やしても保存できるよう中身は検証しない。
 */
const selfSprintHistoryItemSchema = z.looseObject({
  ...historyItemBase,
  assessment: z
    .looseObject({ total_score: z.number() })
    .nullable()
    .optional(),
});

/** Lesson Sprint（コーチ主導）の履歴1件。score は 1(Pass)〜5(No Mistake)、スキップ時は null */
const lessonSprintHistoryItemSchema = z.looseObject({
  ...historyItemBase,
  score: z.number().int().min(1).max(5).nullable(),
  highlighted_word_indices: z.array(z.number().int().nonnegative()),
});

export const selfSprintHistorySchema = z.array(selfSprintHistoryItemSchema).max(SPRINT_HISTORY_MAX_ITEMS);
export const lessonSprintHistorySchema = z.array(lessonSprintHistoryItemSchema).max(SPRINT_HISTORY_MAX_ITEMS);

/**
 * DBから読んだ answered_history を履歴の配列として返す。
 * DBの CHECK 制約で配列であることは保証されるため、型を付けるだけにする（配列でなければ空配列）。
 */
export function readSprintHistory<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
