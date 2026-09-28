import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAdminInvitationEmail } from "@gabby/lib/mail/actions/sendAdminInvitation";

/**
 * 管理者向け招待メールの文面（日英併記。送信はしない。送信処理と同じ組み立て関数で検証する）
 * 画面: docs/screens/common/invite.md
 */

const INVITE_URL = "https://localhost:3001/auth/invite?token=e2e-token";

test("admin 向け招待（日英併記）: 件名・宛名・ボタン・有効期限・リンク", () => {
  const { subject, html } = renderAdminInvitationEmail({ userName: "山田 太郎", inviteUrl: INVITE_URL, expiresDays: 3 });
  assert.equal(subject, "【Gabby Blueprint】管理者アカウント招待のご案内 / Invitation to the Admin Console");
  assert.ok(html.includes("山田 太郎 様"));
  assert.ok(html.includes("Dear 山田 太郎,"));
  assert.ok(html.includes("管理画面のパスワードを設定する / Set your admin password"));
  assert.ok(html.includes("メール送信から3日間です"));
  assert.ok(html.includes("expires 3 days after"));
  assert.ok(html.includes(`href="${INVITE_URL}"`));
  assert.ok(html.indexOf("管理画面（Admin Console）への招待") < html.indexOf("You&#x27;ve been invited"));
});

test("admin 向け招待: 氏名が無い場合は既定の宛名", () => {
  const { html } = renderAdminInvitationEmail({ userName: "", inviteUrl: INVITE_URL, expiresDays: 3 });
  assert.ok(html.includes("管理者様"));
  assert.ok(html.includes("Dear Administrator,"));
  assert.ok(!html.includes("会員"));
});
