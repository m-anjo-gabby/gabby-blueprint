import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMonthGridRange, isMonthParam } from '@gabby/lib/calendar/monthGridRange';

/**
 * 月表示のカレンダー（coach / student）の取得範囲。日付への振り分けは画面が利用者のタイムゾーンで行うため、
 * どのタイムゾーン（UTC-12〜UTC+14）でも、表示する週（初日を含む週〜末日を含む週）を欠けなく覆うこと。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

test('取得範囲: 月の前後に8日ずつの余裕を持つ（年の境目も）', () => {
  assert.deepEqual(getMonthGridRange('2026-10'), {
    startIso: '2026-09-23T00:00:00.000Z',
    endIso: '2026-11-09T00:00:00.000Z',
  });
  assert.deepEqual(getMonthGridRange('2026-12'), {
    startIso: '2026-11-23T00:00:00.000Z',
    endIso: '2027-01-09T00:00:00.000Z',
  });
  assert.equal(getMonthGridRange('2027-01').startIso, '2026-12-24T00:00:00.000Z');
});

test('取得範囲: 前後の週を含むグリッドを、どのタイムゾーンでも覆う', () => {
  // グリッドは初日を含む週の始まり（最大6日前）から、末日を含む週の終わり（翌月の初日から最大6日後の0時）まで。
  // 画面は利用者のタイムゾーンで日付に振り分けるため、UTC+14 の0時（UTC では14時間前）〜UTC-12 の0時（12時間後）を覆う
  const HOUR_MS = 60 * 60 * 1000;
  for (const month of ['2026-02', '2026-03', '2026-08', '2027-02']) {
    const [y, m] = month.split('-').map(Number);
    const gridStart = Date.UTC(y, m - 1, 1) - 6 * DAY_MS - 14 * HOUR_MS;
    const gridEnd = Date.UTC(y, m, 1) + 6 * DAY_MS + 12 * HOUR_MS;
    const { startIso, endIso } = getMonthGridRange(month);
    assert.ok(Date.parse(startIso) <= gridStart, `${month} start`);
    assert.ok(Date.parse(endIso) >= gridEnd, `${month} end`);
  }
});

test('URL の ?month=: YYYY-MM の形（月は 01〜12）だけを受け付ける', () => {
  for (const ok of ['2026-01', '2026-12', '1999-09']) assert.equal(isMonthParam(ok), true, ok);
  for (const bad of ['2026-13', '2026-00', '2026-1', '202610', '2026-10-01', '', null, undefined]) {
    assert.equal(isMonthParam(bad), false, String(bad));
  }
});
