import { test } from "node:test";
import assert from "node:assert/strict";
import { getUtcOffsetMinutes, getWeeklyTimeChanges, listWeeklyOccurrences, shiftWeeklyMinute } from "@gabby/lib/date/date";

/**
 * 専属コーチのマッチングの時刻（生徒の申請時のタイムゾーンで固定・コーチの空き時間は UTC）
 * 画面: docs/screens/coach/availability.md（空き時間の UTC と現地時刻の換算）、
 *       docs/screens/coach/matching-requests.md（夏時間でコーチ側の時刻が変わる日の表示）
 */

test("時差（分）: ミリ秒の端数がある時点でも整数の分で返す（夏時間の前後）", () => {
  assert.equal(getUtcOffsetMinutes("America/Vancouver", new Date("2026-10-06T12:34:56.789Z")), -420);
  assert.equal(getUtcOffsetMinutes("America/Vancouver", new Date("2026-11-06T12:34:56.789Z")), -480);
  assert.equal(getUtcOffsetMinutes("Asia/Tokyo", new Date("2026-10-06T12:34:56.789Z")), 540);
  assert.equal(getUtcOffsetMinutes("Asia/Kolkata", new Date("2026-10-06T12:34:56.789Z")), 330);
});

test("週の中の位置をずらす: 週の終わり・始まりをまたぐと折り返す", () => {
  // UTC 土曜 23:00 → ニューヨーク（夏時間 -4h）では 土曜 19:00
  assert.deepEqual(shiftWeeklyMinute(6, 23 * 60, -240), { day_of_week: 6, minute_of_day: 19 * 60 });
  // UTC 日曜 01:00 → ニューヨーク（-4h）では 前の土曜 21:00
  assert.deepEqual(shiftWeeklyMinute(0, 60, -240), { day_of_week: 6, minute_of_day: 21 * 60 });
  // 東京（+9h）の 土曜 20:00 → UTC 土曜 11:00、日曜 05:00 → UTC 土曜 20:00
  assert.deepEqual(shiftWeeklyMinute(6, 20 * 60, -540), { day_of_week: 6, minute_of_day: 11 * 60 });
  assert.deepEqual(shiftWeeklyMinute(0, 5 * 60, -540), { day_of_week: 6, minute_of_day: 20 * 60 });
});

test("毎週の枠の各回: 生徒の時刻（日本時間 金曜 20:00）で、期間内の回を返す", () => {
  const occurrences = listWeeklyOccurrences(5, "20:00", "Asia/Tokyo", new Date("2026-10-20T00:00:00Z"), new Date("2026-11-14T00:00:00Z"));
  assert.deepEqual(
    occurrences.map((d) => d.toISOString()),
    ["2026-10-23T11:00:00.000Z", "2026-10-30T11:00:00.000Z", "2026-11-06T11:00:00.000Z", "2026-11-13T11:00:00.000Z"]
  );
});

test("夏時間の切り替え: 日本時間で固定した枠は、ニューヨークのコーチ側で 11/1 以降 1時間早くなる", () => {
  const changes = getWeeklyTimeChanges(5, "20:00", "Asia/Tokyo", "America/New_York", new Date("2026-10-20T00:00:00Z"), new Date("2026-12-31T00:00:00Z"));
  assert.deepEqual(
    changes.map((c) => ({ from: c.from.toISOString(), day: c.day_of_week, start: c.start_time })),
    [
      { from: "2026-10-23T11:00:00.000Z", day: 5, start: "07:00" },
      { from: "2026-11-06T11:00:00.000Z", day: 5, start: "06:00" },
    ]
  );
});

test("夏時間の無い組み合わせでは変化しない", () => {
  const changes = getWeeklyTimeChanges(5, "20:00", "Asia/Tokyo", "Asia/Manila", new Date("2026-10-20T00:00:00Z"), new Date("2026-12-31T00:00:00Z"));
  assert.equal(changes.length, 1);
});
