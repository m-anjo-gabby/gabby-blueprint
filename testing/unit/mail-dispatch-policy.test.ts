import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySendError,
  isAllowedRecipient,
  isExpired,
  isUndeliverableAddress,
  parseAllowlist,
  resolveDispatchMode,
} from "@gabby/lib/mail/dispatch/policy";
import { mailEnvironmentTag, toMailEventRecord } from "@gabby/lib/mail/webhook/mailEvent";

/**
 * メールの送信処理の判定（送信の範囲・失敗の扱い・期限切れ）と、到達状況の Webhook の変換
 * 本体: packages/lib/mail/dispatch/policy.ts、packages/lib/mail/webhook/mailEvent.ts
 * 実行: pnpm --filter @gabby/testing unit
 */

test("送信の範囲: 未設定・不明な値は off（設定漏れで実在の人に送らない）", () => {
  assert.equal(resolveDispatchMode(undefined), "off");
  assert.equal(resolveDispatchMode(""), "off");
  assert.equal(resolveDispatchMode("yes"), "off");
  assert.equal(resolveDispatchMode(" ALL "), "all");
  assert.equal(resolveDispatchMode("allowlist"), "allowlist");
});

test("送信の範囲: allowlist は許可したドメインだけ、空の許可リストならどこにも送らない", () => {
  const allowlist = parseAllowlist(" resend.dev, GabbyAcademy.com ,");
  assert.deepEqual(allowlist, ["resend.dev", "gabbyacademy.com"]);
  assert.equal(isAllowedRecipient("Taro@GabbyAcademy.com", "allowlist", allowlist), true);
  assert.equal(isAllowedRecipient("taro@example.co.jp", "allowlist", allowlist), false);
  assert.equal(isAllowedRecipient("taro@gabbyacademy.com", "allowlist", []), false);
  assert.equal(isAllowedRecipient("taro@example.co.jp", "all", []), true);
  assert.equal(isAllowedRecipient("taro@gabbyacademy.com", "off", allowlist), false);
});

test("テスト用の予約済みドメインには送らない", () => {
  assert.equal(isUndeliverableAddress("qa-student@gabby.example"), true);
  assert.equal(isUndeliverableAddress("taro@gabbyacademy.com"), false);
});

test("失敗の扱い: 送信数の上限は数えずに後で、宛先・内容の不正はすぐ失敗、重複防止キーの再利用は送信済み", () => {
  assert.deepEqual(classifySendError("rate_limit_exceeded"), { kind: "defer", delayMinutes: 1 });
  assert.deepEqual(classifySendError("daily_quota_exceeded"), { kind: "defer", delayMinutes: 60 });
  assert.deepEqual(classifySendError("validation_error"), { kind: "fail" });
  assert.deepEqual(classifySendError("invalid_idempotent_request"), { kind: "sent" });
  assert.deepEqual(classifySendError("internal_server_error"), { kind: "retry" });
  // 送信以外の失敗（DB の取得失敗等。Resend のエラーコードが無い）は通常の再試行
  assert.deepEqual(classifySendError(null), { kind: "retry" });
});

test("期限切れ: 積んでから指定の時間を過ぎた行だけ。指定が無い種別は期限なし", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  assert.equal(isExpired("2026-10-05T11:59:00Z", 24, now), true);
  assert.equal(isExpired("2026-10-05T12:01:00Z", 24, now), false);
  assert.equal(isExpired("2026-09-01T00:00:00Z", undefined, now), false);
});

const ENV = "vihincuxiizavuxoctul";

test("環境のタグ: Supabase のプロジェクトID。他の環境・タグの無いメールの出来事は記録しない", () => {
  assert.equal(mailEnvironmentTag("https://vihincuxiizavuxoctul.supabase.co"), ENV);
  assert.equal(mailEnvironmentTag(undefined), null);
  assert.equal(mailEnvironmentTag("not a url"), null);
  const delivered = (tags?: Record<string, string>) => ({
    type: "email.delivered",
    created_at: "2026-10-06T03:00:00Z",
    data: { email_id: "re_1", ...(tags ? { tags } : {}) },
  });
  assert.notEqual(toMailEventRecord("msg_a", delivered({ env: ENV }), ENV), null);
  assert.equal(toMailEventRecord("msg_b", delivered({ env: "otherprojectref" }), ENV), null);
  assert.equal(toMailEventRecord("msg_c", delivered(), ENV), null);
  assert.equal(toMailEventRecord("msg_d", delivered({ env: ENV }), null), null);
});

test("到達状況: 不達の出来事を、送信待ちの行（タグ mail_id）と理由つきで記録する", () => {
  const record = toMailEventRecord(
    "msg_1",
    {
      type: "email.bounced",
      created_at: "2026-10-06T03:00:00Z",
      data: {
        email_id: "re_123",
        to: ["taro@gabbyacademy.com"],
        subject: "【Gabby Blueprint】予約が承認されました",
        tags: { kind: "NOTIFICATION", mail_id: "0f8fad5b-d9cb-469f-a165-70867728950e", env: ENV },
        bounce: { type: "Permanent", subType: "General", message: "Mailbox does not exist" },
      },
    },
    ENV
  );
  assert.deepEqual(record, {
    p_webhook_id: "msg_1",
    p_event_type: "email.bounced",
    p_provider_message_id: "re_123",
    p_mail_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    p_mail_kind: "NOTIFICATION",
    p_recipient: "taro@gabbyacademy.com",
    p_subject: "【Gabby Blueprint】予約が承認されました",
    p_detail: "Permanent/General: Mailbox does not exist",
    p_occurred_at: "2026-10-06T03:00:00Z",
  });
});

test("到達状況: 招待メール（送信待ちを通らない）は mail_id なし、不正な mail_id は捨てる、開封等は記録しない", () => {
  const invite = toMailEventRecord(
    "msg_2",
    {
      type: "email.delivered",
      created_at: "2026-10-06T03:00:00Z",
      data: { email_id: "re_456", to: ["hanako@gabbyacademy.com"], tags: { kind: "account_invite_student", mail_id: "x", env: ENV } },
    },
    ENV
  );
  assert.equal(invite?.p_mail_id, null);
  assert.equal(invite?.p_mail_kind, "account_invite_student");
  assert.equal(invite?.p_detail, null);
  assert.equal(toMailEventRecord("msg_3", { type: "email.opened", created_at: "2026-10-06T03:00:00Z", data: { email_id: "re_789", tags: { env: ENV } } }, ENV), null);
  assert.equal(toMailEventRecord("msg_4", { type: "domain.updated", created_at: "2026-10-06T03:00:00Z", data: {} }, ENV), null);
});

test("日次の要約: 問題が無い日は送らない。件名は件数の合計、明細は上限を超えた分を件数で示す", async () => {
  const { hasMailDailyReportIssues, getMailDailyReportSubject, MAIL_DAILY_REPORT_ITEM_LIMIT } = await import(
    "@gabby/lib/mail/templates/MailDailyReportTemplate"
  );
  const { renderMailDailyReportEmail } = await import("@gabby/lib/mail/render");
  const empty = { periodLabel: "10/05 09:00 〜 10/06 09:00（日本時間 / JST）", failed: [], deliveryProblems: [], overdueCount: 0 };
  assert.equal(hasMailDailyReportIssues(empty), false);

  const item = { at: "10/06 08:00", label: "不達 / Bounced  password_reset", recipient: "taro@gabbyacademy.com", detail: "Permanent" };
  const props = { ...empty, deliveryProblems: Array.from({ length: MAIL_DAILY_REPORT_ITEM_LIMIT + 3 }, () => item), overdueCount: 2 };
  assert.equal(hasMailDailyReportIssues(props), true);
  assert.equal(getMailDailyReportSubject(props), `【Gabby Blueprint】メール配信の要確認 ${MAIL_DAILY_REPORT_ITEM_LIMIT + 5}件 / Email delivery issues: ${MAIL_DAILY_REPORT_ITEM_LIMIT + 5}`);
  const { html, text } = renderMailDailyReportEmail(props);
  assert.ok(html.includes("taro@gabbyacademy.com"));
  assert.ok(text.includes("ほか 3件 / and 3 more"));
  assert.ok(text.includes("MAIL_DISPATCH_MODE"));
});
