import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTrainingMenuEnabled } from '@gabby/lib/trainingMenu/availability';

/**
 * 今日のトレーニングメニューの表示の有無（環境変数 TRAINING_MENU_ENABLED）
 * 本体: packages/lib/trainingMenu/availability.ts
 * 実行: pnpm --filter @gabby/testing unit
 */

test('true のときだけ出す（大文字・前後の空白は許す）', () => {
  assert.equal(isTrainingMenuEnabled('true'), true);
  assert.equal(isTrainingMenuEnabled(' TRUE '), true);
});

test('未設定・空・false・不明な値は出さない（設定漏れで本番に出さない）', () => {
  assert.equal(isTrainingMenuEnabled(undefined), false);
  assert.equal(isTrainingMenuEnabled(''), false);
  assert.equal(isTrainingMenuEnabled('false'), false);
  assert.equal(isTrainingMenuEnabled('1'), false);
  assert.equal(isTrainingMenuEnabled('on'), false);
});
