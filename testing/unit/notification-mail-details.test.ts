import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMail } from "@gabby/lib/mail/render";
import { buildNotificationMail } from "@gabby/lib/mail/templates/NotificationEmailTemplate";
import { buildNotificationDetails, type NotificationMailFacts } from "@gabby/lib/mail/templates/notificationDetails";
import { formatWeeklySlot } from "@gabby/lib/mail/templates/scheduleFormat";
import { getFirstLiveSessionOccurrence } from "@gabby/lib/date/date";
import { NOTIFICATION_MESSAGE_BUILDERS, type NotificationType } from "@gabby/types/notification";
import { NOTIFICATION_MESSAGE_BUILDERS_EN } from "@gabby/types/notificationEn";

/**
 * 出来事の通知メールに載せる対象の情報（日時・振替候補・理由）と件名の日時
 * 本体: packages/lib/mail/templates/notificationDetails.ts（集める処理は dispatch/handlers/notificationFacts.ts）
 * 仕様: testing/e2e/specs/notification/mail-dispatch.md
 * 実行: pnpm --filter @gabby/testing unit
 */

const LINKS = { settingsUrl: null, unsubscribeUrl: null } as const;

// 2026-10-08(木) 19:00〜19:25 JST
const SESSION = { startIso: "2026-10-08T10:00:00Z", endIso: "2026-10-08T10:25:00Z" };

function studentMail(type: NotificationType, payload: Record<string, unknown>, facts: NotificationMailFacts) {
  const text = NOTIFICATION_MESSAGE_BUILDERS[type](payload);
  const details = buildNotificationDetails({ type, facts, timeZone: "Asia/Tokyo", language: "ja" });
  return renderMail(buildNotificationMail({ language: "ja", recipientName: "山田", actionUrl: null, details, links: LINKS, ...text }));
}

function coachMail(type: NotificationType, payload: Record<string, unknown>, facts: NotificationMailFacts, timeZone = "America/Vancouver") {
  const text = NOTIFICATION_MESSAGE_BUILDERS_EN[type](payload);
  const details = buildNotificationDetails({ type, facts, timeZone, language: "en" });
  return renderMail(buildNotificationMail({ language: "en", recipientName: "Alex", actionUrl: null, details, links: LINKS, ...text }));
}

test("キャンセル（生徒宛て）: 件名と本文にキャンセルされたセッションの日時（受信者のタイムゾーン）", () => {
  const { subject, html, text } = studentMail("SESSION_CANCELLED_BY_COACH", { coach_name: "Suzanne" }, { session: SESSION });
  assert.equal(subject, "【Gabby Blueprint】セッションがキャンセルされました（10月8日(木) 19:00）");
  assert.ok(html.includes("キャンセルされたセッション"));
  assert.ok(html.includes("10月8日(木) 19:00〜19:25（日本時間）"));
  assert.ok(text.includes("【キャンセルされたセッション】\n10月8日(木) 19:00〜19:25（日本時間）"));
});

test("キャンセル（コーチ宛て）: コーチのタイムゾーン・英語で、日本語を含まない", () => {
  const { subject, html } = coachMail("SESSION_CANCELLED_BY_STUDENT", { student_name: "Taro" }, { session: SESSION });
  // 10/8 10:00 UTC = 10/8 3:00 AM PDT
  assert.equal(subject, "[Gabby Blueprint] Session cancelled (Thu, Oct 8, 3:00 AM)");
  assert.ok(html.includes("Thu, Oct 8, 3:00 AM – 3:25 AM (PDT)"));
  assert.doesNotMatch(html, /[ぁ-んァ-ン]/);
});

test("キャンセル＋振替候補は1通: キャンセルを見出し・件名の主にし、候補と回答期限を並べる", () => {
  const facts: NotificationMailFacts = {
    session: SESSION,
    proposals: [
      { startIso: "2026-10-09T10:00:00Z", endIso: "2026-10-09T10:25:00Z" },
      { startIso: "2026-10-11T01:00:00Z", endIso: "2026-10-11T01:25:00Z" },
    ],
    proposalExpiresIso: "2026-10-07T10:00:00Z",
  };
  const { subject, html, text } = studentMail("SESSION_RESCHEDULE_PROPOSED", { coach_name: "Suzanne", proposal_count: 2 }, facts);
  assert.equal(subject, "【Gabby Blueprint】セッションのキャンセルと振替候補（10月8日(木) 19:00）");
  assert.ok(html.includes("セッションがキャンセルされました（振替候補あり）"));
  // 本文はアプリ内の通知のまま
  assert.ok(html.includes("Suzanneからキャンセルの振替候補（2件）が届いています。"));
  assert.ok(text.includes("【振替候補1】\n10月9日(金) 19:00〜19:25（日本時間）"));
  assert.ok(text.includes("【振替候補2】\n10月11日(日) 10:00〜10:25（日本時間）"));
  assert.ok(text.includes("振替候補は 10月7日(水) 19:00 までにお選びください。"));
  // キャンセルされたセッションが候補より先
  assert.ok(text.indexOf("キャンセルされたセッション") < text.indexOf("振替候補1"));
});

test("振替候補（コーチ宛て）: 英語の見出し・件名", () => {
  const { subject, html } = coachMail(
    "SESSION_RESCHEDULE_PROPOSED_BY_STUDENT",
    { student_name: "Taro", proposal_count: 1 },
    { session: SESSION, proposals: [{ startIso: "2026-10-09T10:00:00Z", endIso: "2026-10-09T10:25:00Z" }], proposalExpiresIso: null }
  );
  assert.equal(subject, "[Gabby Blueprint] Session cancelled with alternative times (Thu, Oct 8, 3:00 AM)");
  assert.ok(html.includes("Alternative time 1"));
  assert.ok(!html.includes("Please respond by"));
  assert.doesNotMatch(html, /[ぁ-んァ-ン]/);
});

test("予約の確定: 何のセッションが予約されたかを「予約されたセッション」として載せる（生徒宛て・コーチ宛て）", () => {
  const approved = studentMail("SESSION_BOOKING_APPROVED", { coach_name: "Suzanne" }, { session: SESSION });
  assert.equal(approved.subject, "【Gabby Blueprint】予約が承認されました（10月8日(木) 19:00）");
  assert.ok(approved.text.includes("【予約されたセッション】\n10月8日(木) 19:00〜19:25（日本時間）"));
  const booked = coachMail("SESSION_BOOKED_BY_STUDENT", { student_name: "Taro" }, { session: SESSION });
  assert.equal(booked.subject, "[Gabby Blueprint] New session booked (Thu, Oct 8, 3:00 AM)");
  assert.ok(booked.text.includes("[Booked session]\nThu, Oct 8, 3:00 AM – 3:25 AM (PDT)"));
});

test("予約申請（コーチ宛て）: 申請の日時と生徒のメッセージ（空なら出さない）", () => {
  const withMessage = coachMail("SESSION_BOOKING_REQUESTED", { student_name: "Taro" }, { session: SESSION, message: "Looking forward!" });
  assert.equal(withMessage.subject, "[Gabby Blueprint] Booking request received (Thu, Oct 8, 3:00 AM)");
  assert.ok(withMessage.html.includes("Requested time"));
  assert.ok(withMessage.html.includes("Looking forward!"));
  const noMessage = coachMail("SESSION_BOOKING_REQUESTED", { student_name: "Taro" }, { session: SESSION, message: "  " });
  assert.ok(!noMessage.html.includes("Message from the student"));
});

test("予約の否認（生徒宛て）: 申請した日時と否認理由。終了時刻が無い（古い通知）場合は開始時刻だけ", () => {
  const { subject, text } = studentMail(
    "SESSION_BOOKING_REJECTED",
    { coach_name: "Suzanne" },
    { session: { startIso: SESSION.startIso, endIso: null }, reason: "その時間は別の予定があります" }
  );
  assert.equal(subject, "【Gabby Blueprint】予約リクエストについて（10月8日(木) 19:00）");
  assert.ok(text.includes("【リクエストした日時】\n10月8日(木) 19:00〜（日本時間）"));
  assert.ok(text.includes("【理由】\nその時間は別の予定があります"));
});

test("マッチング成立: 毎週の曜日・時間と初回の日時を、初回のセッション（UTC）から生徒のタイムゾーンで出す", () => {
  // コーチ（Vancouver）の 金曜 3:00 AM PDT = 生徒の 金曜 19:00 JST
  const first = { startIso: "2026-10-09T10:00:00Z", endIso: "2026-10-09T10:25:00Z" };
  const { subject, text } = studentMail("MATCHING_APPROVED", { coach_name: "Suzanne" }, { weekly: first });
  assert.equal(subject, "【Gabby Blueprint】マッチングが成立しました！（初回: 10月9日(金) 19:00）");
  assert.ok(text.includes("【曜日・時間】\n毎週金曜 19:00〜19:25（日本時間）"));
  assert.ok(text.includes("【初回のセッション】\n10月9日(金) 19:00〜19:25（日本時間）"));
});

test("マッチングの否認: 申請した曜日・時間（コーチの現地時刻の枠を生徒の時刻へ）と否認理由", () => {
  // コーチ（America/New_York）の 金曜 20:00 の枠 → 生徒の 土曜 9:00（10月は EDT。時差で曜日をまたぐ）
  const now = new Date("2026-10-06T00:00:00Z");
  const { instant } = getFirstLiveSessionOccurrence(5, "20:00", "America/New_York", "Asia/Tokyo", now);
  const weekly = { startIso: instant.toISOString(), endIso: new Date(instant.getTime() + 25 * 60000).toISOString() };
  const { subject, text } = studentMail("MATCHING_REJECTED", { coach_name: "Suzanne" }, { weekly, reason: "その枠は埋まりました" });
  assert.equal(subject, "【Gabby Blueprint】マッチングについて（毎週土曜 09:00）");
  assert.ok(text.includes("【ご希望の曜日・時間】\n毎週土曜 09:00〜09:25（日本時間）"));
  assert.ok(text.includes("【理由】\nその枠は埋まりました"));
});

test("マッチングの申請（コーチ宛て）: 申請された曜日・時間をコーチのタイムゾーンで出し、回答期限を案内する", () => {
  // 生徒は日本時間の金曜 20:00（= 金曜 11:00 UTC = バンクーバー 金曜 4:00 AM PDT）
  const weekly = { startIso: "2026-10-16T11:00:00Z", endIso: "2026-10-16T11:25:00Z" };
  const { subject, text } = coachMail("MATCHING_REQUESTED", { student_name: "Taro" }, { weekly, respondByIso: "2026-10-10T07:00:00Z" });
  assert.equal(subject, "[Gabby Blueprint] New matching request (Every Fri, 4:00 AM)");
  assert.ok(text.includes("Every Fri, 4:00 AM"));
  assert.ok(text.includes("Please approve or reject this request by"));
});

test("マッチングの期限切れ（生徒宛て）: 申請した曜日・時間を出し、理由の欄は出さない", () => {
  const weekly = { startIso: "2026-10-16T11:00:00Z", endIso: "2026-10-16T11:25:00Z" };
  const { subject, text } = studentMail("MATCHING_EXPIRED", { coach_name: "Suzanne" }, { weekly, reason: null });
  assert.equal(subject, "【Gabby Blueprint】マッチングのリクエストが無効になりました（毎週金曜 20:00）");
  assert.ok(text.includes("【ご希望の曜日・時間】\n毎週金曜 20:00〜20:25（日本時間）"));
  assert.ok(!text.includes("【理由】"));
});

test("毎週の枠の曜日は受信者のタイムゾーンで決まる（時差で日付をまたぐ）", () => {
  const start = "2026-10-09T23:30:00Z"; // 金 23:30 UTC = 土 8:30 JST = 金 4:30 PM PDT
  assert.equal(formatWeeklySlot({ startIso: start, endIso: null, timeZone: "Asia/Tokyo", language: "ja", withZone: false }), "毎週土曜 08:30");
  assert.equal(formatWeeklySlot({ startIso: start, endIso: null, timeZone: "America/Vancouver", language: "en", withZone: false }), "Every Fri, 4:30 PM");
});

test("情報が読めない場合（古い通知・行が無い）と対象外の種別は、日時なしの従来の文面", () => {
  const cancelled = studentMail("SESSION_CANCELLED_BY_COACH", { coach_name: "Suzanne" }, { session: null });
  assert.equal(cancelled.subject, "【Gabby Blueprint】セッションがキャンセルされました");
  assert.ok(!cancelled.html.includes("キャンセルされたセッション"));
  const rejected = studentMail("MATCHING_REJECTED", { coach_name: "Suzanne" }, {});
  assert.equal(rejected.subject, "【Gabby Blueprint】マッチングについて");
  const homework = studentMail("HOMEWORK_POSTED", { coach_name: "Suzanne", preview: "Read p.3" }, { session: SESSION });
  assert.equal(homework.subject, "【Gabby Blueprint】Suzanneから宿題が届いています");
});
