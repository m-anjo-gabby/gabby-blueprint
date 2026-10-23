import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRecommendedSprintTimeSec } from '@gabby/lib/sprint/utils';

/**
 * スプリントの推奨の制限時間（コーチの Live Sprint の Recommended・生徒の今日のメニュー）。
 * 現行システムの目安: Speed は Lv.1〜5 が60秒・Lv.6〜10 が90秒、Builders は90秒、
 * Structure・Mastery は Lv.1〜5 が90秒・Lv.6〜10 が120秒。Lv.0（Basic）は Lv.1〜5 と同じ。
 * 種別: '0' Speed / '5' Builders / '4' Structure / '6' Mastery
 */

test('UG Speed: Lv.5 までは60秒、Lv.6 からは90秒', () => {
  assert.equal(getRecommendedSprintTimeSec('0', 0), 60);
  assert.equal(getRecommendedSprintTimeSec('0', 5), 60);
  assert.equal(getRecommendedSprintTimeSec('0', 6), 90);
  assert.equal(getRecommendedSprintTimeSec('0', 10), 90);
});

test('UG Builders: 全レベルで90秒', () => {
  assert.equal(getRecommendedSprintTimeSec('5', 1), 90);
  assert.equal(getRecommendedSprintTimeSec('5', 5), 90);
});

test('UG Structure・UG Mastery: Lv.5 までは90秒、Lv.6 からは120秒', () => {
  for (const type of ['4', '6'] as const) {
    assert.equal(getRecommendedSprintTimeSec(type, type === '4' ? 0 : 1), 90);
    assert.equal(getRecommendedSprintTimeSec(type, 5), 90);
    assert.equal(getRecommendedSprintTimeSec(type, 6), 120);
    assert.equal(getRecommendedSprintTimeSec(type, 10), 120);
  }
});
