/**
 * 招待・パスワード再設定・通知・リマインダー・運営向けの日次の要約のメールを全パターン送る（文面の目視確認用。Resend の管理画面の送信履歴で確認する）。
 * 実行: pnpm --filter @gabby/testing exec tsx features/mail-samples/send-mail-samples.ts
 *
 * 送信処理（packages/lib/mail/dispatch/）と同じ文面の組み立て関数を使い、サンプルの値で組み立てる。
 * 宛先は Resend のテスト用アドレス（delivered+mr-<種類>@resend.dev。@ の前は64文字まで）で、実在の人には届かない。
 * 一部だけ送り直す場合は --only=<種類の一部>（例: --only=coach-SESSION_RESCHEDULE）。
 * 送らずに HTML・テキストをファイルに書き出す場合は --out=<フォルダ>（ロゴは手元の apps/student/public/mail-logo.png を参照する。ブラウザで見た目を確かめる用）。
 * 書き出した結果から全パターンの一覧（メール文面カタログ）を作る手順は .claude/skills/mail-catalog/SKILL.md。
 * メールの種類・パターンを追加したら、ここにサンプルを足し、カタログの区分（.claude/skills/mail-catalog/scripts/build.mjs の GROUPS）にも足す。
 * 送信元・API キーは apps/admin/.env.local（MAIL_FROM_NOTIFY、無ければ MAIL_FROM_AUTH）。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { renderMail, type RenderedEmail } from "@gabby/lib/mail/render";
import { buildAdminInviteMail } from "@gabby/lib/mail/templates/AdminInviteEmailTemplate";
import { buildCoachInviteMail } from "@gabby/lib/mail/templates/CoachInviteEmailTemplate";
import { buildEventReminderMail } from "@gabby/lib/mail/templates/EventReminderEmailTemplate";
import { buildStudentInviteMail } from "@gabby/lib/mail/templates/InviteEmailTemplate";
import { buildLiveSessionReminderMail } from "@gabby/lib/mail/templates/LiveSessionReminderEmailTemplate";
import { buildMailDailyReport } from "@gabby/lib/mail/templates/MailDailyReportTemplate";
import { checkMailConfig } from "@gabby/lib/mail/dispatch/policy";
import { buildChatUnreadMail, buildNotificationMail } from "@gabby/lib/mail/templates/NotificationEmailTemplate";
import { buildNotificationDetails, type NotificationMailFacts } from "@gabby/lib/mail/templates/notificationDetails";
import { buildPasswordResetMail } from "@gabby/lib/mail/templates/PasswordResetEmailTemplate";
import { formatReminderSchedule } from "@gabby/lib/mail/templates/reminder";
import { getMailLogoUrl } from "@gabby/lib/mail/assets/logo";
import { buildUnsubscribeUrl, unsubscribeHeaders } from "@gabby/lib/mail/unsubscribe/token";
import { NOTIFICATION_MESSAGE_BUILDERS, type NotificationType } from "@gabby/types/notification";
import { NOTIFICATION_MESSAGE_BUILDERS_EN } from "@gabby/types/notificationEn";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
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
samples.push({ label: "auth-student-INVITE", ...renderMail(buildStudentInviteMail({ userName: "山田 太郎", inviteUrl: INVITE_URL, expiresDays: 3 })) });
samples.push({ label: "auth-coach-INVITE", ...renderMail(buildCoachInviteMail({ userName: "Suzanne", inviteUrl: INVITE_URL.replace(STUDENT_URL, COACH_URL), expiresDays: 3 })) });
samples.push({ label: "auth-admin-INVITE", ...renderMail(buildAdminInviteMail({ userName: "山田 太郎", inviteUrl: INVITE_URL.replace(STUDENT_URL, "https://localhost:3001"), expiresDays: 3 })) });
samples.push({ label: "auth-student-RESET", ...renderMail(buildPasswordResetMail({ resetUrl: INVITE_URL.replace("invite", "recovery"), language: "ja" })) });
samples.push({ label: "auth-coach-RESET", ...renderMail(buildPasswordResetMail({ resetUrl: INVITE_URL.replace("invite", "recovery"), language: "en" })) });
samples.push({ label: "auth-admin-RESET", ...renderMail(buildPasswordResetMail({ resetUrl: INVITE_URL.replace("invite", "recovery"), language: "bilingual" })) });

// ---- 出来事の通知（アプリ内通知と同じ文言に、対象の日時・振替候補・理由。生徒は日本語、コーチは英語） ----
// 対象の日時（送信処理は業務データから読む。サンプルは 10/8(木) 19:00 JST の回）
const slot = (iso: string) => ({ startIso: iso, endIso: new Date(Date.parse(iso) + 25 * 60 * 1000).toISOString() });
const SESSION = slot("2026-10-08T10:00:00Z");
const PROPOSALS = [slot("2026-10-09T10:00:00Z"), slot("2026-10-10T01:00:00Z"), slot("2026-10-11T11:30:00Z")];
const RESCHEDULE: NotificationMailFacts = { session: SESSION, proposals: PROPOSALS, proposalExpiresIso: "2026-10-07T10:00:00Z" };

const STUDENT_TYPES: [NotificationType, Record<string, unknown>, string, NotificationMailFacts][] = [
  ["SESSION_CANCELLED_BY_COACH", { coach_name: "Suzanne" }, "/live-room", { session: SESSION }],
  ["SESSION_RESCHEDULE_PROPOSED", { coach_name: "Suzanne", proposal_count: 3 }, "/live-room", RESCHEDULE],
  ["SESSION_BOOKING_APPROVED", { coach_name: "Suzanne" }, "/live-room", { session: SESSION }],
  ["SESSION_BOOKING_REJECTED", { coach_name: "Suzanne" }, "/live-room", { session: SESSION, reason: "その時間は別の予定が入っています。" }],
  ["MATCHING_APPROVED", { coach_name: "Suzanne" }, "/live-room", { weekly: SESSION }],
  ["MATCHING_REJECTED", { coach_name: "Suzanne" }, "/coach-matching", { weekly: SESSION, reason: "申し訳ありません、その枠は他の生徒の担当が決まりました。" }],
  ["HOMEWORK_POSTED", { coach_name: "Suzanne", preview: "Please practice the final /n/ sound with the sentences we used today." }, "/live-room/sessions/sample/result", {}],
];
const COACH_TYPES: [NotificationType, Record<string, unknown>, string, NotificationMailFacts][] = [
  ["SESSION_CANCELLED_BY_STUDENT", { student_name: "Taro Yamada" }, "/students/sample", { session: SESSION }],
  ["SESSION_RESCHEDULE_PROPOSED_BY_STUDENT", { student_name: "Taro Yamada", proposal_count: 2 }, "/calendar", { ...RESCHEDULE, proposals: PROPOSALS.slice(0, 2) }],
  ["SESSION_BOOKED_BY_STUDENT", { student_name: "Taro Yamada" }, "/students/sample", { session: SESSION }],
  ["SESSION_BOOKING_REQUESTED", { student_name: "Taro Yamada" }, "/calendar", { session: SESSION, message: "I'd like to practice for my presentation." }],
  ["MATCHING_ASSIGNED_TO_COACH", { student_name: "Taro Yamada" }, "/students/sample", {}],
  ["COACH_REPORT_APPROVED", { report_month: "2026-09-01" }, "/monthly-reports?month=2026-09", {}],
  ["COACH_REPORT_APPROVAL_REVOKED", { report_month: "2026-09-01" }, "/monthly-reports?month=2026-09", {}],
];

for (const [type, payload, linkPath, facts] of STUDENT_TYPES) {
  const text = NOTIFICATION_MESSAGE_BUILDERS[type](payload);
  samples.push({
    label: `student-${type}`,
    ...renderMail(buildNotificationMail({
      language: "ja",
      recipientName: "山田 太郎",
      title: text.title,
      body: text.body,
      actionUrl: `${STUDENT_URL}${linkPath}`,
      details: buildNotificationDetails({ type, facts, timeZone: "Asia/Tokyo", language: "ja" }),
      links: { settingsUrl: `${STUDENT_URL}/profile`, unsubscribeUrl: STUDENT_UNSUB.NOTIFICATION },
    })),
    unsubscribeUrl: STUDENT_UNSUB.NOTIFICATION,
  });
}
for (const [type, payload, linkPath, facts] of COACH_TYPES) {
  const text = NOTIFICATION_MESSAGE_BUILDERS_EN[type](payload);
  samples.push({
    label: `coach-${type}`,
    ...renderMail(buildNotificationMail({
      language: "en",
      recipientName: "Suzanne",
      title: text.title,
      body: text.body,
      actionUrl: `${COACH_URL}${linkPath}`,
      details: buildNotificationDetails({ type, facts, timeZone: "America/Vancouver", language: "en" }),
      links: { settingsUrl: `${COACH_URL}/profile`, unsubscribeUrl: COACH_UNSUB.NOTIFICATION },
    })),
    unsubscribeUrl: COACH_UNSUB.NOTIFICATION,
  });
}

// ---- チャットの新着（未読が10分続いたら） ----
samples.push({
  label: "student-CHAT_UNREAD",
  ...renderMail(buildChatUnreadMail({
    language: "ja",
    recipientName: "山田 太郎",
    senderName: "Suzanne",
    preview: "Hi Taro! Great job today. Don't forget to review the phrases before our next session.",
    actionUrl: `${STUDENT_URL}/chat/sample`,
    links: { settingsUrl: `${STUDENT_URL}/profile`, unsubscribeUrl: STUDENT_UNSUB.NOTIFICATION },
  })),
  unsubscribeUrl: STUDENT_UNSUB.NOTIFICATION,
});
samples.push({
  label: "coach-CHAT_UNREAD",
  ...renderMail(buildChatUnreadMail({
    language: "en",
    recipientName: "Suzanne",
    senderName: "Taro Yamada",
    preview: "明日のセッション、5分ほど遅れるかもしれません。よろしくお願いします。",
    actionUrl: `${COACH_URL}/chat/sample`,
    links: { settingsUrl: `${COACH_URL}/profile`, unsubscribeUrl: COACH_UNSUB.NOTIFICATION },
  })),
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
    ...renderMail(buildEventReminderMail({
      language,
      lead,
      recipientName: language === "ja" ? "山田 太郎" : "Suzanne",
      title: "Week 2: Final /n/ in connected speech",
      seriesTitle: options.seriesTitle ?? null,
      description: "つながる話し方の中での語尾 /n/：次の単語へなめらかにつなぐリンキング（英語での講義です）",
      scheduleLabel: formatReminderSchedule({ startIso: start.toISOString(), endIso: end.toISOString(), timeZone: options.timeZone, language }),
      joinUrl: options.joinUrl === undefined ? "https://zoom.us/j/0000000000" : options.joinUrl,
      detailUrl: `${portal}${language === "ja" ? "/group-sessions" : "/calendar"}`,
      links: { settingsUrl: `${portal}/profile`, unsubscribeUrl },
    })),
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
  const actionPath = isStudent ? "/live-room" : "/students/sample/sessions/sample";
  const unsubscribeUrl = (isStudent ? STUDENT_UNSUB : COACH_UNSUB).REMINDER;
  samples.push({
    label,
    unsubscribeUrl,
    ...renderMail(buildLiveSessionReminderMail({
      language,
      lead,
      recipientName: isStudent ? "山田 太郎" : "Suzanne",
      counterpartName: isStudent ? "Suzanne" : "Taro Yamada",
      scheduleLabel: formatReminderSchedule({ startIso: start.toISOString(), endIso: liveEnd.toISOString(), timeZone, language }),
      actionUrl: `${isStudent ? STUDENT_URL : COACH_URL}${actionPath}`,
      links: { settingsUrl: `${isStudent ? STUDENT_URL : COACH_URL}/profile`, unsubscribeUrl },
    })),
  });
};
liveReminder("student-LIVE-24h", "ja", "24h", "Asia/Tokyo");
liveReminder("student-LIVE-1h", "ja", "1h", "Asia/Tokyo");
liveReminder("coach-LIVE-24h", "en", "24h", "America/Vancouver");
liveReminder("coach-LIVE-1h", "en", "1h", "America/Vancouver");

// ---- 運営向けの日次の要約（毎日 09:00 JST。異常なし・要確認あり） ----
const OPS_CONFIG = {
  MAIL_DISPATCH_MODE: "all",
  RESEND_WEBHOOK_SECRET: "whsec_sample",
  MAIL_UNSUBSCRIBE_SECRET: "sample",
};
const PERIOD = "10/07 09:00 〜 10/08 09:00（日本時間 / JST）";
samples.push({
  label: "ops-DAILY_REPORT-ok",
  ...renderMail(buildMailDailyReport({
    periodLabel: PERIOD,
    sentCount: 42,
    skippedCount: 5,
    failed: [],
    deliveryProblems: [],
    overdueCount: 0,
    config: checkMailConfig(OPS_CONFIG),
  })),
});
samples.push({
  label: "ops-DAILY_REPORT-issues",
  ...renderMail(buildMailDailyReport({
    periodLabel: PERIOD,
    sentCount: 40,
    skippedCount: 3,
    failed: [{ at: "10/08 07:12", label: "FAILED  NOTIFICATION", recipient: "taro.sample@example.com", detail: "Invalid `to` field" }],
    deliveryProblems: [{ at: "10/07 21:05", label: "不達 / Bounced  GROUP_SESSION_REMINDER", recipient: "hanako.sample@example.com", detail: "Permanent" }],
    overdueCount: 0,
    config: checkMailConfig({ ...OPS_CONFIG, MAIL_UNSUBSCRIBE_SECRET: "" }),
  })),
});

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
