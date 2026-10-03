import { test } from "node:test";
import assert from "node:assert/strict";
import { formatZonedDate, toIsoDateInZone, toIsoMonthInZone } from "@gabby/lib/date/date";

/**
 * 実績の日付は生徒のタイムゾーンでの実施日で数える（仕様: e2e/specs/training/training-stats.md）。
 * - 日時（UTC）は生徒のタイムゾーンの日付に変換する
 * - 日付だけの値（日次サマリーの training_date。記録時点のタイムゾーンで確定済み）は変換しない
 */

test("日時は生徒のタイムゾーンの日付・月になる（日本時間 10/1 8:00 は10月の実績）", () => {
  const jst0800 = "2026-09-30T23:00:00Z";
  assert.equal(toIsoDateInZone(jst0800, "Asia/Tokyo"), "2026-10-01");
  assert.equal(toIsoMonthInZone(jst0800, "Asia/Tokyo"), "2026-10");
  assert.equal(toIsoDateInZone(jst0800, "America/New_York"), "2026-09-30");
});

test("日付だけの値はどのタイムゾーンでも同じ日付のまま", () => {
  for (const zone of ["Asia/Tokyo", "America/New_York", "America/Vancouver", "UTC"]) {
    assert.equal(toIsoDateInZone("2026-10-01", zone), "2026-10-01", zone);
    assert.equal(toIsoMonthInZone("2026-10-01", zone), "2026-10", zone);
    assert.equal(formatZonedDate("2026-10-01", zone), "2026/10/01", zone);
  }
});

test("集計期間（日本時間）の月の範囲と今月", async () => {
  const { currentReportingMonth, reportingMonthRange } = await import("@gabby/lib/date/reporting");
  assert.deepEqual(reportingMonthRange("2026-09"), { from: "2026-08-31T15:00:00.000Z", to: "2026-09-30T15:00:00.000Z" });
  assert.deepEqual(reportingMonthRange("2026-12"), { from: "2026-11-30T15:00:00.000Z", to: "2026-12-31T15:00:00.000Z" });
  // UTC 9/30 23:00 は日本時間 10/1 08:00
  assert.equal(currentReportingMonth(new Date("2026-09-30T23:00:00Z")), "2026-10");
});
