import { expect, test } from "@playwright/test";
import { cleanupAuthFixture, createAuthFixture, createDisposableStudent, type AuthFixture } from "../../support/authFixtures.ts";
import { cronSecret, invokeMailDailyReport, opsAlertAddress } from "../../support/mailDispatch.ts";
import { getPersonaPassword } from "../../support/personas.ts";
import { resendReadApiKey, resendTestAddress, waitForEmail } from "../../support/resendInbox.ts";

/**
 * 運営向けのメール配信の日次の要約（testing/e2e/specs/notification/mail-dispatch.md「運営への日次の要約」）。
 * pg_cron の毎日のジョブの代わりに、送信処理（admin の /api/cron/mail-dispatch）を task=daily_report で呼ぶ。
 * 宛先は admin の MAIL_OPS_ALERT_TO（dev は Resend のテスト用アドレス）。使い捨ての顧客・生徒で行い、最後に削除する。
 */

let fixture: AuthFixture | undefined;

test.afterAll(async () => {
  await cleanupAuthFixture(fixture);
});

test("送信失敗があった日は、運営のアドレスへ要確認の要約が届く", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "メール送信は desktop のみ");
  const opsAddress = opsAlertAddress();
  test.skip(!resendReadApiKey() || !cronSecret() || !opsAddress, "RESEND_TEST_READ_API_KEY・CRON_SECRET・MAIL_OPS_ALERT_TO のいずれかが未設定");

  fixture = await createAuthFixture("mail");
  const userName = `E2E日次要約 ${fixture.tag}`;
  const studentId = await createDisposableStudent(fixture, {
    email: resendTestAddress(`${fixture.tag}-report`),
    password: getPersonaPassword(),
    userName,
  });
  // 再試行の上限に達した送信待ち（直近24時間の送信失敗）
  const { error } = await fixture.admin.from("com_t_mail_outbox").insert({
    user_id: studentId,
    mail_type: "NOTIFICATION",
    category: "NOTIFICATION",
    dedup_key: `e2e-report-${fixture.tag}`,
    status: "FAILED",
    attempts: 5,
    last_error: `mail:core:api_failed: E2E ${fixture.tag}`,
  });
  if (error) throw new Error(error.message);

  const since = new Date();
  const result = await invokeMailDailyReport();
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ sent: opsAddress!.split(",").length, issues: expect.any(Number) });
  expect((result.body as { issues: number }).issues).toBeGreaterThanOrEqual(1);

  const mail = await waitForEmail({ to: opsAddress!.split(",")[0].trim(), since });
  expect(mail.subject).toMatch(/^【Gabby Blueprint】メール配信の要確認 \d+件 \/ Email delivery issues: \d+$/);
  expect(mail.html).toContain(userName);
  expect(mail.html).toContain(`E2E ${fixture.tag}`);
  expect(mail.text).toContain("送信失敗 / Failed to send");
  expect(mail.text).toContain("設定の状況 / Configuration");
});
