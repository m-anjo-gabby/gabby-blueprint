import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReminderSchedule, renderEventReminderEmail, renderLiveSessionReminderEmail } from "@gabby/lib/mail/render";

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
  detailUrl: "https://localhost:3000/group-sessions",
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

test("シリーズに属する回は、セッション名の上にシリーズ名を載せる", () => {
  const { html, text } = renderEventReminderEmail({ ...BASE, seriesTitle: "10月の発音グループセッション", language: "ja", lead: "24h" });
  assert.ok(html.includes("10月の発音グループセッション"));
  // HTML は先頭の要約（プレビュー文）にもセッション名が入るため、並びはテキスト版で確かめる
  assert.ok(text.includes(["【セッション】", "10月の発音グループセッション", "英語でおしゃべり会"].join("\n")));
});

test("ライブセッション（生徒・日本語）: 1時間前も確認ボタン（ライブセッション画面）と入室できる時刻の案内、相手はコーチ", () => {
  const { subject, html } = renderLiveSessionReminderEmail({
    language: "ja",
    lead: "1h",
    recipientName: "山田",
    counterpartName: "Suzanne",
    scheduleLabel: "10月12日(月) 20:00〜20:25（日本時間）",
    actionUrl: "https://localhost:3000/live-room",
    settingsUrl: "https://localhost:3000/profile",
  });
  assert.equal(subject, "【Gabby Blueprint】まもなくライブセッションが始まります（10月12日(月) 20:00〜20:25（日本時間））");
  assert.ok(html.includes("コーチ"));
  assert.ok(html.includes("Suzanne"));
  assert.ok(html.includes("ライブセッションを確認する"));
  assert.ok(!html.includes("入室する"));
  assert.ok(html.includes('href="https://localhost:3000/live-room"'));
  assert.ok(html.includes("開始5分前から入室できます。"));
});

test("ライブセッション（生徒・日本語）: 24時間前は確認ボタンとキャンセル・振替の案内", () => {
  const { subject, html } = renderLiveSessionReminderEmail({
    language: "ja",
    lead: "24h",
    recipientName: "山田",
    counterpartName: "Suzanne",
    scheduleLabel: "10月12日(月) 20:00〜20:25（日本時間）",
    actionUrl: "https://localhost:3000/live-room",
    settingsUrl: "https://localhost:3000/profile",
  });
  assert.equal(subject, "【Gabby Blueprint】ライブセッションのご案内（10月12日(月) 20:00〜20:25（日本時間））");
  assert.ok(html.includes("ライブセッションを確認する"));
  assert.ok(html.includes("キャンセル・振替の手続き"));
  assert.ok(!html.includes("入室できます"));
});

test("ライブセッション（コーチ・英語）: 相手は生徒、日本語を含まない", () => {
  const { subject, html } = renderLiveSessionReminderEmail({
    language: "en",
    lead: "1h",
    recipientName: "Suzanne",
    counterpartName: "Taro Yamada",
    scheduleLabel: "Mon, Oct 12, 4:00 AM – 4:25 AM (PDT)",
    actionUrl: "https://localhost:3002/students/x/sessions/s1",
    settingsUrl: "https://localhost:3002/profile",
  });
  assert.equal(subject, "[Gabby Blueprint] Your live session starts soon (Mon, Oct 12, 4:00 AM – 4:25 AM (PDT))");
  assert.ok(html.includes("Student"));
  assert.ok(html.includes("Taro Yamada"));
  assert.ok(html.includes("Open session"));
  assert.doesNotMatch(html, /[ぁ-んァ-ン]/);
});
