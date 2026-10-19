import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  lessonSprintHistorySchema,
  readSprintHistory,
  selfSprintHistorySchema,
  SPRINT_HISTORY_MAX_ITEMS,
} from '@gabby/lib/sprint/answeredHistory';

/**
 * スプリントの解答の履歴（answered_history の JSON）。サーバーアクションは誰でも呼べるため、保存前に形を確かめ、
 * 壊れた・巨大な配列を保存させないこと（DB は配列であることだけを CHECK 制約で保証する）。
 */

const base = { question_id: 'q-1', group_id: null, seq_no: 1, is_skipped: false };

test('自主トレの履歴: 正しい形は通し、表示用の詳細（analysis 等）の項目は増えても通す', () => {
  assert.equal(selfSprintHistorySchema.safeParse([]).success, true);
  assert.equal(selfSprintHistorySchema.safeParse([{ ...base, assessment: null }]).success, true);
  assert.equal(selfSprintHistorySchema.safeParse([{ ...base }]).success, true);
  const withDetail = [{ ...base, assessment: { total_score: 82, analysis: { words: [] } }, extra: 1 }];
  assert.equal(selfSprintHistorySchema.safeParse(withDetail).success, true);
});

test('自主トレの履歴: 必須の項目の欠け・型の誤り・配列でない値は通さない', () => {
  for (const value of [
    [{ ...base, question_id: '' }],
    [{ ...base, seq_no: 0 }],
    [{ ...base, seq_no: 1.5 }],
    [{ ...base, is_skipped: 'false' }],
    [{ group_id: null, seq_no: 1, is_skipped: false }],
    [{ ...base, assessment: { total_score: '82' } }],
    { ...base },
    null,
  ]) {
    assert.equal(selfSprintHistorySchema.safeParse(value).success, false, JSON.stringify(value));
  }
});

test('Lesson Sprint の履歴: 点数は 1〜5 の整数か、スキップの null', () => {
  const ok = { ...base, score: 5, highlighted_word_indices: [0, 3] };
  assert.equal(lessonSprintHistorySchema.safeParse([ok]).success, true);
  assert.equal(lessonSprintHistorySchema.safeParse([{ ...ok, score: null, is_skipped: true }]).success, true);
  for (const bad of [
    { ...ok, score: 0 },
    { ...ok, score: 6 },
    { ...ok, score: 2.5 },
    { ...ok, highlighted_word_indices: [-1] },
    { ...ok, highlighted_word_indices: undefined },
  ]) {
    assert.equal(lessonSprintHistorySchema.safeParse([bad]).success, false, JSON.stringify(bad));
  }
});

test('履歴: 上限の件数を超える配列は通さない', () => {
  const item = { ...base, assessment: null };
  assert.equal(selfSprintHistorySchema.safeParse(Array(SPRINT_HISTORY_MAX_ITEMS).fill(item)).success, true);
  assert.equal(selfSprintHistorySchema.safeParse(Array(SPRINT_HISTORY_MAX_ITEMS + 1).fill(item)).success, false);
});

test('DB から読んだ履歴: 配列でなければ空の配列として扱う', () => {
  assert.deepEqual(readSprintHistory([{ ...base }]), [{ ...base }]);
  assert.deepEqual(readSprintHistory(null), []);
  assert.deepEqual(readSprintHistory({ ...base }), []);
});
