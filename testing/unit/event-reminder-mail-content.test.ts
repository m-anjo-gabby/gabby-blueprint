import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReminderSchedule, renderEventReminderEmail } from "@gabby/lib/mail/render";

/**
 * グループセッションのリマインダーメールの文面（送信はしない。送信処理と同じ組み立て関数で検証する）
 * 送信処理: packages/lib/mail/dispatch/handlers/groupSessionReminder.ts
 * 実行: pnpm --filter @gabby/testing unit
 */

const START = "2026-10-12T11:00:00.000Z"; // 日本時間 20:00
const END = "2026-10-12T12:00:00.000Z";

test("開催日時は受信者のタイムゾーンで表す（日本語・英語）", () => {
  assert.equal(
    formatReminderSchedule({ startIso: START, endIso: END, timeZone: "Asia/Tokyo", language: "ja" }),
    "10月12日(月) 20:00〜21:00（日本時間）"
  );
  assert.equal(
    formatReminderSchedule({ startIso: START, endIso: null, timeZone: "Asia/Tokyo", language: "ja" }),
    "10月12日(月) 20:00〜（日本時間）"
  );
  const en = formatReminderSchedule({ startIso: START, endIso: END, timeZone: "America/New_York", language: "en" });
  assert.match(en, /^Mon, Oct 12, 7:00\s?AM – 8:00\s?AM \(EDT\)$/);
});

const BASE = {
  recipientName: "山田",
  title: "英語でおしゃべり会",
  description: "テーマ: 旅行",
  scheduleLabel: "10月12日(月) 20:00〜21:00（日本時間）",
  joinUrl: "https://zoom.example/j/123?pwd=abc",
  detailUrl: "https://localhost:3000/dashboard",
  settingsUrl: "https://localhost:3000/profile",
} as const;

test("生徒向け（日本語）24時間前: 件名・参加ボタン・詳細・配信停止の案内", () => {
  const { subject, html } = renderEventReminderEmail({ ...BASE, language: "ja", lead: "24h" });
  assert.equal(subject, "【Gabby Blueprint】グループセッションのご案内（10月12日(月) 20:00〜21:00（日本時間））");
  assert.ok(html.includes("山田 さん"));
  assert.ok(html.includes("英語でおしゃべり会"));
  assert.ok(html.includes("セッションに参加する"));
  assert.ok(html.includes(`href="${BASE.joinUrl.replace(/&/g, "&amp;")}"`));
  assert.ok(html.includes(`href="${BASE.settingsUrl}"`));
  assert.ok(html.includes("「メール通知」で停止できます"));
});

test("1時間前は「まもなく」の件名、参加URLが無い場合は案内文", () => {
  const { subject, html } = renderEventReminderEmail({ ...BASE, language: "ja", lead: "1h", joinUrl: null });
  assert.ok(subject.startsWith("【Gabby Blueprint】まもなくグループセッションが始まります"));
  assert.ok(!html.includes("セッションに参加する"));
  assert.ok(html.includes("参加用のリンクは、決まり次第アプリでお知らせします。"));
});

test("コーチ向け（英語）: 日本語を含まない", () => {
  const { subject, html } = renderEventReminderEmail({
    ...BASE,
    recipientName: "Alex",
    title: "Speaking Club",
    description: null,
    scheduleLabel: "Mon, Oct 12, 7:00 AM – 8:00 AM (EDT)",
    language: "en",
    lead: "24h",
  });
  assert.equal(subject, "[Gabby Blueprint] Upcoming group session: Mon, Oct 12, 7:00 AM – 8:00 AM (EDT)");
  assert.ok(html.includes("Hi Alex,"));
  assert.ok(html.includes("Join the session"));
  assert.doesNotMatch(html, /[ぁ-んァ-ン]/);
});
