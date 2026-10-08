import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMail } from "@gabby/lib/mail/render";
import { buildNotificationMail } from "@gabby/lib/mail/templates/NotificationEmailTemplate";
import { NOTIFICATION_MESSAGE_BUILDERS } from "@gabby/types/notification";
import { NOTIFICATION_MESSAGE_BUILDERS_EN } from "@gabby/types/notificationEn";

/**
 * 出来事の通知メールの文面（送信はしない。送信処理 packages/lib/mail/dispatch/handlers/notification.ts と同じ組み立て関数で検証する）
 * 仕様: testing/e2e/specs/notification/mail-dispatch.md
 * 実行: pnpm --filter @gabby/testing unit
 */

const BASE = {
  recipientName: "山田",
  actionUrl: "https://localhost:3000/live-room",
  links: { settingsUrl: "https://localhost:3000/profile", unsubscribeUrl: null },
} as const;

test("生徒向け（日本語）: アプリ内通知と同じタイトル・本文に、アプリへのボタンと配信停止の案内", () => {
  const text = NOTIFICATION_MESSAGE_BUILDERS.SESSION_BOOKING_APPROVED({ coach_name: "Suzanne" });
  const { subject, html } = renderMail(buildNotificationMail({ ...BASE, language: "ja", ...text }));
  assert.equal(subject, "【Gabby Blueprint】予約が承認されました");
  assert.ok(html.includes("山田 さん"));
  assert.ok(html.includes("Suzanneがセッションの予約を承認しました。"));
  assert.ok(html.includes(`href="${BASE.actionUrl}"`));
  assert.ok(html.includes("アプリで確認する"));
  assert.ok(html.includes("通知のメールは、プロフィールの「メール通知」で停止できます"));
});

test("コーチ向け（英語）: 日本語を含まない", () => {
  const text = NOTIFICATION_MESSAGE_BUILDERS_EN.SESSION_CANCELLED_BY_STUDENT({ student_name: "Taro" });
  const { subject, html } = renderMail(buildNotificationMail({
    ...BASE,
    recipientName: "Alex",
    actionUrl: "https://localhost:3002/students/x",
    language: "en",
    ...text,
  }));
  assert.equal(subject, "[Gabby Blueprint] Session cancelled");
  assert.ok(html.includes("Hi Alex,"));
  assert.ok(html.includes("Taro cancelled a scheduled session."));
  assert.ok(html.includes("Open in the app"));
  assert.doesNotMatch(html, /[ぁ-んァ-ン]/);
});

test("チャットはメッセージの冒頭を引用として載せ、アプリへのリンクが無ければボタンを出さない", () => {
  const { html } = renderMail(buildNotificationMail({
    ...BASE,
    language: "ja",
    title: "Suzanneさんから新しいメッセージが届いています",
    body: "Hello! See you tomorrow.",
    quoted: true,
    actionUrl: null,
  }));
  assert.ok(html.includes("border-left:3px solid #0e3196"));
  assert.ok(html.includes("Hello! See you tomorrow."));
  assert.ok(!html.includes("アプリで確認する"));
});
