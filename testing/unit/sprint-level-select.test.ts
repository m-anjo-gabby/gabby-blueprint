import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasSprintQuestionsForType,
  isSprintLevelAvailable,
  isSprintLevelSelectable,
  pickSprintLevel,
  resolveSprintHasLevel,
} from '@gabby/lib/sprint/utils';

/**
 * スプリントのレベルの選び方（生徒の自主トレ・コーチの Live Sprint の設定）。
 * レベル管理あり（level_managed）の生徒は到達レベル+1まで、管理なしは全レベルを選べる。問題の無いレベルは選べない。
 * 種別: '0' Speed（0〜10）/ '5' Builders（1〜5）/ '4' Structure（0〜10）/ '6' Mastery（1〜10）
 */

const progress = { level_speed: 3, level_builders: 1, level_structure: 0, level_mastery: 2, level_managed: true };

test('レベルの有無: コーパスのスプリントだけが設定でレベル無しにできる', () => {
  assert.equal(resolveSprintHasLevel({ sprint_type: '0', has_level: false }), true);
  assert.equal(resolveSprintHasLevel({ sprint_type: '1', has_level: false }), false);
  assert.equal(resolveSprintHasLevel({ sprint_type: '1', has_level: true }), true);
  assert.equal(resolveSprintHasLevel(null), true);
});

test('選べるレベル: レベル管理ありは到達レベル+1まで（最小のレベルは常に選べる）', () => {
  assert.equal(isSprintLevelSelectable('0', 4, progress), true);
  assert.equal(isSprintLevelSelectable('0', 5, progress), false);
  assert.equal(isSprintLevelSelectable('4', 0, progress), true);
  assert.equal(isSprintLevelSelectable('4', 1, progress), true);
  assert.equal(isSprintLevelSelectable('4', 2, progress), false);
  // 進捗が無い生徒は最初のレベルの次まで
  assert.equal(isSprintLevelSelectable('5', 1, null), true);
  assert.equal(isSprintLevelSelectable('5', 2, null), false);
});

test('選べるレベル: レベル管理なしは全レベル、ただし種別の範囲の外は選べない', () => {
  const unmanaged = { ...progress, level_managed: false };
  assert.equal(isSprintLevelSelectable('0', 10, unmanaged), true);
  assert.equal(isSprintLevelSelectable('0', 11, unmanaged), false);
  assert.equal(isSprintLevelSelectable('5', 6, unmanaged), false);
  assert.equal(isSprintLevelSelectable('6', 0, unmanaged), false);
});

test('問題のあるレベル: 一覧が取れない時は絞り込まない', () => {
  const available = { '0': [1, 2, 3], '5': [] };
  assert.equal(hasSprintQuestionsForType(available, '0'), true);
  assert.equal(hasSprintQuestionsForType(available, '5'), false);
  assert.equal(hasSprintQuestionsForType(available, '4'), false);
  assert.equal(hasSprintQuestionsForType(null, '4'), true);
  assert.equal(isSprintLevelAvailable(available, '0', 2), true);
  assert.equal(isSprintLevelAvailable(available, '0', 4), false);
  assert.equal(isSprintLevelAvailable(undefined, '0', 4), true);
});

test('初期のレベル: 前回のレベルが選べればそれ、無ければ選べる最小のレベル', () => {
  const available = { '0': [1, 2, 3, 6] };
  const isSelectable = (level: number) => isSprintLevelSelectable('0', level, progress);
  assert.equal(pickSprintLevel('0', { hasLevel: true, availableLevels: available, isSelectable, preferred: 3 }), 3);
  // 前回の 6 は選べない（到達レベル+1 を超える）ため、選べる最小の 1
  assert.equal(pickSprintLevel('0', { hasLevel: true, availableLevels: available, isSelectable, preferred: 6 }), 1);
  // 選べるレベルが無ければ、問題のある最初のレベル
  assert.equal(pickSprintLevel('0', { hasLevel: true, availableLevels: { '0': [8] }, isSelectable }), 8);
  // 問題の一覧も無ければ種別の最小
  assert.equal(pickSprintLevel('5', { hasLevel: true, availableLevels: { '5': [] }, isSelectable: () => false }), 1);
  // レベルの無い教材は 1
  assert.equal(pickSprintLevel('0', { hasLevel: false, availableLevels: available }), 1);
});
