import { test } from "node:test";
import assert from "node:assert/strict";
import { getFirstLiveSessionOccurrence } from "@gabby/lib/date/date";

/**
 * 専属コーチの申請ダイアログに出す「初回ライブセッション予定日」
 * 画面: docs/screens/student/coach-matching.md（リクエストダイアログ）
 */

// 2026-10-05(月) 09:00 JST
const NOW = new Date("2026-10-05T00:00:00Z");

test("現在の契約: 現在時刻から24時間以上先の直近の回", () => {
  // 水曜 19:00 JST → 10/7(水)
  const first = getFirstLiveSessionOccurrence(3, "19:00", "Asia/Tokyo", "Asia/Tokyo", NOW);
  assert.equal(first.instant.toISOString(), "2026-10-07T10:00:00.000Z");
});

test("24時間以内の回は翌週になる", () => {
  // 火曜 08:00 JST（24時間後の 10/6 09:00 より前）→ 10/13(火)
  const first = getFirstLiveSessionOccurrence(2, "08:00", "Asia/Tokyo", "Asia/Tokyo", NOW);
  assert.equal(first.instant.toISOString(), "2026-10-12T23:00:00.000Z");
});

test("開始前の契約: 契約の開始日時より前の回は対象外", () => {
  // 契約開始 2026-12-01 00:00 JST。水曜 19:00 JST → 12/2(水)（11/25 等は対象外）
  const contractStart = new Date("2026-11-30T15:00:00Z");
  const first = getFirstLiveSessionOccurrence(3, "19:00", "Asia/Tokyo", "Asia/Tokyo", NOW, contractStart);
  assert.equal(first.instant.toISOString(), "2026-12-02T10:00:00.000Z");
});

test("開始前の契約: 開始日当日の回は対象", () => {
  // 契約開始 2026-12-01(火) 00:00 JST。火曜 19:00 JST → 12/1
  const contractStart = new Date("2026-11-30T15:00:00Z");
  const first = getFirstLiveSessionOccurrence(2, "19:00", "Asia/Tokyo", "Asia/Tokyo", NOW, contractStart);
  assert.equal(first.instant.toISOString(), "2026-12-01T10:00:00.000Z");
});
