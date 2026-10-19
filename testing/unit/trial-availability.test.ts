import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTrialApplicationEnabled } from '@gabby/lib/trial/availability';

/**
 * Webトライアルの申込の受付の有無（環境変数 TRIAL_APPLICATION_ENABLED）
 * 本体: packages/lib/trial/availability.ts
 * 実行: pnpm --filter @gabby/testing unit
 */

test('true のときだけ受け付ける（大文字・前後の空白は許す）', () => {
  assert.equal(isTrialApplicationEnabled('true'), true);
  assert.equal(isTrialApplicationEnabled(' TRUE '), true);
});

test('未設定・空・false・不明な値は受け付けない（設定漏れで公開しない）', () => {
  assert.equal(isTrialApplicationEnabled(undefined), false);
  assert.equal(isTrialApplicationEnabled(''), false);
  assert.equal(isTrialApplicationEnabled('false'), false);
  assert.equal(isTrialApplicationEnabled('1'), false);
  assert.equal(isTrialApplicationEnabled('on'), false);
});
