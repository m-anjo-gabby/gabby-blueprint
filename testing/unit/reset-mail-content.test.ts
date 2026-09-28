import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPasswordResetEmail } from "@gabby/lib/mail/actions/sendPasswordReset";

/**
 * パスワード再設定メールの文面（送信はしない。送信処理と同じ組み立て関数で検証する）
 * 仕様: e2e/specs/auth/password-reset-and-invite.md、画面: docs/screens/common/password-reset.md
 *
 * React のメールテンプレートを描画するため、Playwright ではなく Node のテストランナーで実行する
 * （Playwright のテスト実行環境は JSX を独自形式に変換するため、React で描画できない）。
 * 実行: pnpm --filter @gabby/testing unit
 */

const RESET_URL = "https://localhost:3000/auth/callback?token_hash=e2e-token&type=recovery&next=/update-password";

test("student 向け（日本語）: 件名・本文・有効期限・リンク", () => {
  const { subject, html } = renderPasswordResetEmail({ resetUrl: RESET_URL, language: "ja" });
  assert.equal(subject, "【Gabby Blueprint】パスワード再設定手続きのご案内");
  assert.ok(html.includes("パスワードを再設定する"));
  assert.ok(html.includes("メール送信から30分間です"));
  assert.ok(html.includes("お問い合わせ先（Gabby Blueprint サポート窓口）"));
  assert.ok(!html.includes("Reset password"));
  assert.ok(!html.includes("ササポート"));
  assert.ok(html.includes(`href="${RESET_URL.replace(/&/g, "&amp;")}"`));
});

test("coach 向け（英語）: 日本語を含まない", () => {
  const { subject, html } = renderPasswordResetEmail({ resetUrl: RESET_URL, language: "en" });
  assert.equal(subject, "[Gabby Blueprint] Reset your password");
  assert.ok(html.includes("Reset password"));
  assert.ok(html.includes("expires 30 minutes after"));
  assert.doesNotMatch(html, /[ぁ-んァ-ン]/);
});

test("admin 向け（日英併記）: 日本語→英語の順で両方を載せる", () => {
  const { subject, html } = renderPasswordResetEmail({ resetUrl: RESET_URL, language: "bilingual" });
  assert.equal(subject, "【Gabby Blueprint】パスワード再設定のご案内 / Reset your password");
  assert.ok(html.includes("パスワードを再設定する / Reset password"));
  assert.ok(html.includes("メール送信から30分間です"));
  assert.ok(html.includes("expires 30 minutes after"));
  assert.ok(html.indexOf("いつも Gabby Blueprint English") < html.indexOf("Thank you for using"));
});
