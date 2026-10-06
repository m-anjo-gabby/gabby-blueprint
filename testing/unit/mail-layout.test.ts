import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderAdminInvitationEmail,
  renderCoachInvitationEmail,
  renderEventReminderEmail,
  renderLiveSessionReminderEmail,
  renderNotificationEmail,
  renderPasswordResetEmail,
  renderStudentInvitationEmail,
  type RenderedEmail,
} from "@gabby/lib/mail/render";
import { DEFAULT_MAIL_LOGO_URL } from "@gabby/lib/mail/assets/logo";
import { buildUnsubscribeUrl, unsubscribeHeaders, verifyUnsubscribeToken } from "@gabby/lib/mail/unsubscribe/token";

/**
 * 全メール共通の外枠（ロゴ・プレビュー文・テキスト版・会社情報）と、ログイン不要の配信停止の署名
 * 外枠: packages/lib/mail/layout/、配信停止: packages/lib/mail/unsubscribe/
 * 実行: pnpm --filter @gabby/testing unit
 */

const INVITE_URL = "https://localhost:3000/auth/invite?token=e2e-token";
const ACTION_URL = "https://localhost:3000/live-room";
const UNSUBSCRIBE_URL = "https://localhost:3000/mail/unsubscribe?u=user-1&c=NOTIFICATION&t=sig";

const ALL: [string, RenderedEmail][] = [
  ["パスワード再設定（日本語）", renderPasswordResetEmail({ resetUrl: INVITE_URL, language: "ja" })],
  ["パスワード再設定（併記）", renderPasswordResetEmail({ resetUrl: INVITE_URL, language: "bilingual" })],
  ["管理者招待", renderAdminInvitationEmail({ userName: "山田", inviteUrl: INVITE_URL })],
  ["コーチ招待", renderCoachInvitationEmail({ userName: "Alex", inviteUrl: INVITE_URL })],
  ["生徒招待", renderStudentInvitationEmail({ userName: "山田", inviteUrl: INVITE_URL })],
  [
    "通知",
    renderNotificationEmail({ language: "ja", recipientName: "山田", title: "予約が承認されました", body: "本文", actionUrl: ACTION_URL, settingsUrl: null }),
  ],
  [
    "グループセッションのリマインダー",
    renderEventReminderEmail({
      language: "en",
      lead: "24h",
      recipientName: "Alex",
      title: "Speaking Club",
      description: null,
      scheduleLabel: "Mon, Oct 12",
      joinUrl: ACTION_URL,
      detailUrl: null,
      settingsUrl: null,
    }),
  ],
  [
    "ライブセッションのリマインダー",
    renderLiveSessionReminderEmail({
      language: "ja",
      lead: "1h",
      recipientName: "山田",
      counterpartName: "Suzanne",
      scheduleLabel: "10月12日(月) 20:00〜",
      actionUrl: ACTION_URL,
      settingsUrl: null,
    }),
  ],
];

test("全メール: ヘッダーは本番の生徒ポータルのロゴ画像（画像が出ない場合は alt の文字）、会社情報、HTML の文書として完結", () => {
  for (const [label, { html }] of ALL) {
    assert.ok(html.startsWith("<!DOCTYPE html><html"), label);
    assert.ok(html.includes(`src="${DEFAULT_MAIL_LOGO_URL}"`), label);
    assert.ok(html.includes('alt="Gabby Blueprint English"'), label);
    assert.ok(html.includes("https://gabbyacademy.com/"), label);
    assert.ok(html.includes('<meta name="color-scheme" content="light"/>'), label);
  }
});

test("全メール: テキスト版は HTML のタグを含まず、ボタンの遷移先の URL をそのまま載せる", () => {
  for (const [label, { html, text }] of ALL) {
    assert.ok(text.length > 100, label);
    assert.doesNotMatch(text, /<[a-z/!][^>]*>/i, label);
    assert.doesNotMatch(text, /&amp;|&#x27;/, label);
    assert.ok(text.startsWith("Gabby Blueprint English\n"), label);
    // HTML のボタンの遷移先（属性値はエスケープされている）がテキスト版にもある
    const href = html.match(/<a href="([^"]+)" style="display:inline-block/)?.[1]?.replace(/&amp;/g, "&");
    assert.ok(href && text.includes(`\n${href}`), label);
  }
});

test("日英併記: テキスト版も日本語→英語の順で、言語の間に区切り線", () => {
  const { text } = renderPasswordResetEmail({ resetUrl: INVITE_URL, language: "bilingual" });
  const divider = text.indexOf("------------------------------");
  assert.ok(divider > 0);
  assert.ok(text.indexOf("いつも Gabby Blueprint English") < divider);
  assert.ok(text.indexOf("Thank you for using") > divider);
  assert.ok(text.includes("▼ パスワードを再設定する / Reset password\n" + INVITE_URL));
});

test("受信一覧の要約（プレビュー文）: 本文の先頭に非表示で入れる", () => {
  const { html } = renderLiveSessionReminderEmail({
    language: "ja",
    lead: "24h",
    recipientName: "山田",
    counterpartName: "Suzanne",
    scheduleLabel: "10月12日(月) 20:00〜20:25（日本時間）",
    actionUrl: ACTION_URL,
    settingsUrl: null,
  });
  const body = html.slice(html.indexOf("<body"));
  assert.match(body, /^<body[^>]*><div style="display:none;[^"]*">10月12日\(月\) 20:00〜20:25（日本時間） Suzanne<\/div>/);
});

test("通知・リマインダー: 配信停止の URL があればフッターに載せ、無ければ載せない", () => {
  const base = {
    language: "ja",
    recipientName: "山田",
    title: "予約が承認されました",
    body: "本文",
    actionUrl: ACTION_URL,
    settingsUrl: "https://localhost:3000/profile",
  } as const;
  const withLink = renderNotificationEmail({ ...base, unsubscribeUrl: UNSUBSCRIBE_URL });
  assert.ok(withLink.html.includes(`href="${UNSUBSCRIBE_URL.replace(/&/g, "&amp;")}"`));
  assert.ok(withLink.html.includes("この種類のメールを停止する"));
  assert.ok(withLink.text.includes(`この種類のメールを停止する: ${UNSUBSCRIBE_URL}`));

  const without = renderNotificationEmail(base);
  assert.ok(!without.html.includes("この種類のメールを停止する"));
  assert.ok(without.text.includes("メール通知の設定: https://localhost:3000/profile"));
});

test("配信停止の署名: 同じ宛先・区分だけ照合でき、鍵が無ければ URL を作らない", () => {
  const secret = "test-secret";
  const url = buildUnsubscribeUrl({ portalBaseUrl: "https://localhost:3000/", userId: "user-1", category: "REMINDER", secret });
  assert.ok(url?.startsWith("https://localhost:3000/mail/unsubscribe?u=user-1&c=REMINDER&t="));
  const token = new URL(url!).searchParams.get("t")!;

  assert.equal(verifyUnsubscribeToken({ userId: "user-1", category: "REMINDER", token, secret }), true);
  assert.equal(verifyUnsubscribeToken({ userId: "user-2", category: "REMINDER", token, secret }), false);
  assert.equal(verifyUnsubscribeToken({ userId: "user-1", category: "NOTIFICATION", token, secret }), false);
  assert.equal(verifyUnsubscribeToken({ userId: "user-1", category: "REMINDER", token, secret: "other" }), false);
  assert.equal(verifyUnsubscribeToken({ userId: "user-1", category: "REMINDER", token: "short", secret }), false);

  assert.equal(buildUnsubscribeUrl({ portalBaseUrl: "https://localhost:3000", userId: "user-1", category: "REMINDER", secret: null }), null);
  assert.equal(buildUnsubscribeUrl({ portalBaseUrl: "", userId: "user-1", category: "REMINDER", secret }), null);

  assert.deepEqual(unsubscribeHeaders(url), {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  assert.equal(unsubscribeHeaders(null), undefined);
});
