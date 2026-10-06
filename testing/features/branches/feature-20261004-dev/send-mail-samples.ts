/**
 * 通知・リマインダーのメールを全パターン送る（文面の目視確認用。Resend の管理画面の送信履歴で確認する）。
 * 実行: pnpm --filter @gabby/testing exec tsx features/branches/feature-20261004-dev/send-mail-samples.ts
 *
 * 送信処理（packages/lib/mail/dispatch/）と同じ文面の組み立て関数を使い、サンプルの値で組み立てる。
 * 宛先は Resend のテスト用アドレス（delivered+mr-<種類>@resend.dev。@ の前は64文字まで）で、実在の人には届かない。
 * 一部だけ送り直す場合は --only=<種類の一部>（例: --only=coach-SESSION_RESCHEDULE）。
 * 送らずに HTML・テキストをファイルに書き出す場合は --out=<フォルダ>（ロゴは手元の apps/student/public/mail-logo.png を参照する。ブラウザで見た目を確かめる用）。
 * 送信元・API キーは apps/admin/.env.local（MAIL_FROM_NOTIFY、無ければ MAIL_FROM_AUTH）。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import {
  formatReminderSchedule,
  renderAdminInvitationEmail,
  renderCoachInvitationEmail,
  renderEventReminderEmail,
  renderLiveSessionReminderEmail,
  renderNotificationEmail,
  renderPasswordResetEmail,
  renderStudentInvitationEmail,
  type RenderedEmail,
} from "@gabby/lib/mail/render";
import { getMailLogoUrl } from "@gabby/lib/mail/assets/logo";
import { buildUnsubscribeUrl, unsubscribeHeaders } from "@gabby/lib/mail/unsubscribe/token";
import { NOTIFICATION_MESSAGE_BUILDERS, type NotificationType } from "@gabby/types/notification";
import { NOTIFICATION_MESSAGE_BUILDERS_EN } from "@gabby/types/notificationEn";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const adminEnv = dotenv.parse(readFileSync(path.join(REPO_ROOT, "apps/admin/.env.local")));
const API_KEY = adminEnv.RESEND_API_KEY;
const FROM = adminEnv.MAIL_FROM_NOTIFY || adminEnv.MAIL_FROM_AUTH || "Gabby Academy <noreply@mail.gabbyacademy.com>";
if (!API_KEY) throw new Error("apps/admin/.env.local に RESEND_API_KEY がありません");

const STUDENT_URL = "https://localhost:3000";
const COACH_URL = "https://localhost:3002";

interface Sample extends RenderedEmail {
  label: string;
  /** 配信停止の URL（通知・リマインダーのみ。List-Unsubscribe ヘッダーにも使う） */
  unsubscribeUrl?: string | null;
}

const samples: Sample[] = [];

/** 配信停止の URL（サンプル用の鍵で署名する。宛先のユーザーは架空） */
const sampleUnsubscribeUrl = (portal: string, category: "NOTIFICATION" | "REMINDER") =>
  buildUnsubscribeUrl({ portalBaseUrl: portal, userId: "00000000-0000-0000-0000-000000000000", category, secret: "sample" });
const STUDENT_UNSUB = { NOTIFICATION: sampleUnsubscribeUrl(STUDENT_URL, "NOTIFICATION"), REMINDER: sampleUnsubscribeUrl(STUDENT_URL, "REMINDER") };
const COACH_UNSUB = { NOTIFICATION: sampleUnsubscribeUrl(COACH_URL, "NOTIFICATION"), REMINDER: sampleUnsubscribeUrl(COACH_URL, "REMINDER") };

// ---- アカウント関連（招待・パスワード再設定。送信待ちを通らず、配信停止の対象外） ----
const INVITE_URL = `${STUDENT_URL}/auth/callback?token_hash=sample-token&type=invite&next=/update-password`;
samples.push({ label: "auth-student-INVITE", ...renderStudentInvitationEmail({ userName: "山田 太郎", inviteUrl: INVITE_URL }) });
samples.push({ label: "auth-coach-INVITE", ...renderCoachInvitationEmail({ userName: "Suzanne", inviteUrl: INVITE_URL.replace(STUDENT_URL, COACH_URL) }) });
samples.push({ label: "auth-admin-INVITE", ...renderAdminInvitationEmail({ userName: "山田 太郎", inviteUrl: INVITE_URL.replace(STUDENT_URL, "https://localhost:3001") }) });
samples.push({ label: "auth-student-RESET", ...renderPasswordResetEmail({ resetUrl: INVITE_URL.replace("invite", "recovery"), language: "ja" }) });
samples.push({ label: "auth-coach-RESET", ...renderPasswordResetEmail({ resetUrl: INVITE_URL.replace("invite", "recovery"), language: "en" }) });
samples.push({ label: "auth-admin-RESET", ...renderPasswordResetEmail({ resetUrl: INVITE_URL.replace("invite", "recovery"), language: "bilingual" }) });

// ---- 出来事の通知（アプリ内通知と同じ文言。生徒は日本語、コーチは英語） ----
const STUDENT_TYPES: [NotificationType, Record<string, unknown>, string][] = [
  ["SESSION_CANCELLED_BY_COACH", { coach_name: "Suzanne" }, "/live-room"],
  ["SESSION_RESCHEDULE_PROPOSED", { coach_name: "Suzanne", proposal_count: 3 }, "/live-room"],
  ["SESSION_BOOKING_APPROVED", { coach_name: "Suzanne" }, "/live-room"],
  ["SESSION_BOOKING_REJECTED", { coach_name: "Suzanne" }, "/live-room"],
  ["MATCHING_APPROVED", { coach_name: "Suzanne" }, "/live-room"],
  ["MATCHING_REJECTED", { coach_name: "Suzanne" }, "/coach-matching"],
  ["HOMEWORK_POSTED", { coach_name: "Suzanne", preview: "Please practice the final /n/ sound with the sentences we used today." }, "/live-room"],
];
const COACH_TYPES: [NotificationType, Record<string, unknown>, string][] = [
  ["SESSION_CANCELLED_BY_STUDENT", { student_name: "Taro Yamada" }, "/students/sample"],
  ["SESSION_RESCHEDULE_PROPOSED_BY_STUDENT", { student_name: "Taro Yamada", proposal_count: 2 }, "/requests"],
  ["SESSION_BOOKED_BY_STUDENT", { student_name: "Taro Yamada" }, "/students/sample"],
  ["SESSION_BOOKING_REQUESTED", { student_name: "Taro Yamada" }, "/requests"],
  ["MATCHING_ASSIGNED_TO_COACH", { student_name: "Taro Yamada" }, "/students/sample"],
  ["COACH_REPORT_APPROVED", { report_month: "2026-09-01" }, "/monthly-reports"],
  ["COACH_REPORT_APPROVAL_REVOKED", { report_month: "2026-09-01" }, "/monthly-reports"],
];

for (const [type, payload, linkPath] of STUDENT_TYPES) {
  const text = NOTIFICATION_MESSAGE_BUILDERS[type](payload);
  samples.push({
    label: `student-${type}`,
    ...renderNotificationEmail({
      language: "ja",
      recipientName: "山田 太郎",
      title: text.title,
      body: text.body,
      actionUrl: `${STUDENT_URL}${linkPath}`,
      settingsUrl: `${STUDENT_URL}/profile`,
      unsubscribeUrl: STUDENT_UNSUB.NOTIFICATION,
    }),
    unsubscribeUrl: STUDENT_UNSUB.NOTIFICATION,
  });
}
for (const [type, payload, linkPath] of COACH_TYPES) {
  const text = NOTIFICATION_MESSAGE_BUILDERS_EN[type](payload);
  samples.push({
    label: `coach-${type}`,
    ...renderNotificationEmail({
      language: "en",
      recipientName: "Suzanne",
      title: text.title,
      body: text.body,
      actionUrl: `${COACH_URL}${linkPath}`,
      settingsUrl: `${COACH_URL}/profile`,
      unsubscribeUrl: COACH_UNSUB.NOTIFICATION,
    }),
    unsubscribeUrl: COACH_UNSUB.NOTIFICATION,
  });
}

// ---- チャットの新着（未読が10分続いたら） ----
samples.push({
  label: "student-CHAT_UNREAD",
  ...renderNotificationEmail({
    language: "ja",
    recipientName: "山田 太郎",
    title: "Suzanneさんから新しいメッセージが届いています",
    body: "Hi Taro! Great job today. Don't forget to review the phrases before our next session.",
    quoted: true,
    actionUrl: `${STUDENT_URL}/chat/sample`,
    settingsUrl: `${STUDENT_URL}/profile`,
    unsubscribeUrl: STUDENT_UNSUB.NOTIFICATION,
  }),
  unsubscribeUrl: STUDENT_UNSUB.NOTIFICATION,
});
samples.push({
  label: "coach-CHAT_UNREAD",
  ...renderNotificationEmail({
    language: "en",
    recipientName: "Suzanne",
    title: "New message from Taro Yamada",
    body: "明日のセッション、5分ほど遅れるかもしれません。よろしくお願いします。",
    quoted: true,
    actionUrl: `${COACH_URL}/chat/sample`,
    settingsUrl: `${COACH_URL}/profile`,
    unsubscribeUrl: COACH_UNSUB.NOTIFICATION,
  }),
  unsubscribeUrl: COACH_UNSUB.NOTIFICATION,
});

// ---- グループセッションのリマインダー（24時間前・1時間前 × 生徒/コーチ。シリーズあり・参加URLなしの違いも含める） ----
// 翌日の 21:00（日本時間）= 12:00 UTC
const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
start.setUTCHours(12, 0, 0, 0);
const end = new Date(start.getTime() + 30 * 60 * 1000);
const reminder = (
  label: string,
  language: "ja" | "en",
  lead: "24h" | "1h",
  options: { seriesTitle?: string | null; joinUrl?: string | null; timeZone: string }
) => {
  const portal = language === "ja" ? STUDENT_URL : COACH_URL;
  const unsubscribeUrl = (language === "ja" ? STUDENT_UNSUB : COACH_UNSUB).REMINDER;
  samples.push({
    label,
    unsubscribeUrl,
    ...renderEventReminderEmail({
      language,
      lead,
      recipientName: language === "ja" ? "山田 太郎" : "Suzanne",
      title: "Week 2: Final /n/ in connected speech",
      seriesTitle: options.seriesTitle ?? null,
      description: "つながる話し方の中での語尾 /n/：次の単語へなめらかにつなぐリンキング（英語での講義です）",
      scheduleLabel: formatReminderSchedule({ startIso: start.toISOString(), endIso: end.toISOString(), timeZone: options.timeZone, language }),
      joinUrl: options.joinUrl === undefined ? "https://zoom.us/j/0000000000" : options.joinUrl,
      detailUrl: `${portal}${language === "ja" ? "/dashboard" : "/calendar"}`,
      settingsUrl: `${portal}/profile`,
      unsubscribeUrl,
    }),
  });
};
reminder("student-REMINDER-24h-series", "ja", "24h", { seriesTitle: "10月の発音グループセッション", timeZone: "Asia/Tokyo" });
reminder("student-REMINDER-1h-single-nourl", "ja", "1h", { joinUrl: null, timeZone: "Asia/Tokyo" });
reminder("coach-REMINDER-24h-series", "en", "24h", { seriesTitle: "October Pronunciation Group Sessions", timeZone: "America/Vancouver" });
reminder("coach-REMINDER-1h", "en", "1h", { timeZone: "America/Vancouver" });

// ---- ライブセッションのリマインダー（24時間前・1時間前 × 生徒/コーチ） ----
const liveEnd = new Date(start.getTime() + 25 * 60 * 1000);
const liveReminder = (label: string, language: "ja" | "en", lead: "24h" | "1h", timeZone: string) => {
  const isStudent = language === "ja";
  const actionPath = isStudent ? (lead === "1h" ? "/live-room/sample" : "/live-room") : "/students/sample/sessions/sample";
  const unsubscribeUrl = (isStudent ? STUDENT_UNSUB : COACH_UNSUB).REMINDER;
  samples.push({
    label,
    unsubscribeUrl,
    ...renderLiveSessionReminderEmail({
      language,
      lead,
      recipientName: isStudent ? "山田 太郎" : "Suzanne",
      counterpartName: isStudent ? "Suzanne" : "Taro Yamada",
      scheduleLabel: formatReminderSchedule({ startIso: start.toISOString(), endIso: liveEnd.toISOString(), timeZone, language }),
      actionUrl: `${isStudent ? STUDENT_URL : COACH_URL}${actionPath}`,
      settingsUrl: `${isStudent ? STUDENT_URL : COACH_URL}/profile`,
      unsubscribeUrl,
    }),
  });
};
liveReminder("student-LIVE-24h", "ja", "24h", "Asia/Tokyo");
liveReminder("student-LIVE-1h", "ja", "1h", "Asia/Tokyo");
liveReminder("coach-LIVE-24h", "en", "24h", "America/Vancouver");
liveReminder("coach-LIVE-1h", "en", "1h", "America/Vancouver");

// ---- 送信（Resend の送信レートに収めるため1件ずつ間隔を空ける） ----
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const outDir = process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length);
const targets = only ? samples.filter((sample) => sample.label.includes(only)) : samples;

if (outDir) {
  // 書き出しのみ（ロゴは本番に未反映でも見られるよう、手元の画像を参照する）
  mkdirSync(outDir, { recursive: true });
  const localLogo = pathToFileURL(path.join(REPO_ROOT, "apps/student/public/mail-logo.png")).href;
  for (const sample of targets) {
    const html = sample.html.replaceAll(getMailLogoUrl(), localLogo);
    writeFileSync(path.join(outDir, `${sample.label}.html`), html);
    writeFileSync(path.join(outDir, `${sample.label}.txt`), `件名: ${sample.subject}\n\n${sample.text}`);
  }
  console.log(`${targets.length} 件を ${outDir} に書き出しました`);
  process.exit(0);
}

let sent = 0;
for (const sample of targets) {
  const to = `${`delivered+mr-${sample.label.toLowerCase().replace(/_/g, "-")}`.slice(0, 64)}@resend.dev`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: sample.subject,
      html: sample.html,
      text: sample.text,
      headers: unsubscribeHeaders(sample.unsubscribeUrl ?? null),
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`NG ${sample.label}: HTTP ${res.status} ${body}`);
  } else {
    sent += 1;
    console.log(`OK ${sample.label} → ${to}  件名: ${sample.subject}`);
  }
  await sleep(700);
}
console.log(`\n${sent} /${targets.length} 件を送信しました（送信元: ${FROM}）`);
