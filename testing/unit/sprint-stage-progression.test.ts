import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampLevel,
  computeStage,
  getForcedLevels,
  getStageGaps,
  getStageGoals,
  meetsStageGoals,
} from '@gabby/lib/sprint/stageProgression';
import type { StageLevels } from '@gabby/types/stageProgression';

/**
 * スプリントのステージ（4種別のレベルの組み合わせで決まる到達段階）。コーチ・アドミンがレベルを変えると、
 * ステージはレベルから計算し直す（ステージの列とレベルの列が食い違わないように）。
 * 種別: '0' Speed / '5' Builders / '4' Structure / '6' Mastery（packages/types/sprint.ts の QUESTION_TYPES）
 */

const levels = (speed: number, builders: number, structure: number, mastery: number): StageLevels => ({
  '0': speed,
  '5': builders,
  '4': structure,
  '6': mastery,
});

test('ステージ: レベルから、条件をすべて満たす最大のステージになる', () => {
  assert.equal(computeStage(levels(0, 0, 0, 0)), 0);
  assert.equal(computeStage(levels(1, 1, 0, 0)), 1);
  // Speed だけ上げても、Builders が足りなければ上がらない
  assert.equal(computeStage(levels(10, 1, 10, 10)), 1);
  assert.equal(computeStage(levels(3, 3, 1, 1)), 3);
  // ステージ6以降、Builders は 5 のまま（Builders の上限が 5 のため）
  assert.equal(computeStage(levels(6, 5, 4, 4)), 6);
  assert.equal(computeStage(levels(10, 5, 10, 10)), 10);
});

test('ステージ: 条件の判定と、条件の無いステージ', () => {
  assert.equal(meetsStageGoals(3, levels(3, 3, 1, 1)), true);
  assert.equal(meetsStageGoals(3, levels(3, 3, 0, 1)), false);
  assert.deepEqual(getStageGoals(0), levels(0, 0, 0, 0));
  assert.deepEqual(getStageGoals(99), levels(0, 0, 0, 0));
});

test('ステージ: 足りない種別と不足量を、種別の表示順で返す', () => {
  assert.deepEqual(getStageGaps(4, levels(4, 2, 2, 1)), [
    { questionType: '5', required: 4, current: 2 },
    { questionType: '6', required: 2, current: 1 },
  ]);
  assert.deepEqual(getStageGaps(4, levels(4, 4, 2, 2)), []);
});

test('ステージ: 強制到達では、足りない種別だけを条件まで上げる（満たしている種別は下げない）', () => {
  assert.deepEqual(getForcedLevels(5, levels(7, 2, 3, 0)), levels(7, 5, 3, 3));
  const forced = getForcedLevels(8, levels(0, 0, 0, 0));
  assert.equal(computeStage(forced), 8);
});

test('レベル: 種別ごとの範囲に収める', () => {
  assert.equal(clampLevel('0', -1), 0);
  assert.equal(clampLevel('0', 11), 10);
  assert.equal(clampLevel('5', 0), 1);
  assert.equal(clampLevel('5', 9), 5);
  assert.equal(clampLevel('6', 0), 1);
  assert.equal(clampLevel('4', 7), 7);
});
