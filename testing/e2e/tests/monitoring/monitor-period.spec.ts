import { test, expect, loginAsNewStudent } from "../../support/studentApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  grantAppLicense,
  type AuthFixture,
} from "../../support/authFixtures.ts";

/**
 * モニターの期間（ジャーニー: e2e/journeys/customer-progress-review.md「集計の基準」）
 * - 期間の区切り（対象月・対象生徒の判定）は日本時間: 9/1 0:00 JST 開始の契約の受講生は、8月の一覧に出ず9月から出る
 * - 各実績の日付は実施した生徒のタイムゾーンでの実施日: 日本の受講生の 10/1 0:30 JST（UTC 9/30）の回は10/1。
 *   閲覧する担当者のタイムゾーン（ニューヨーク）には左右されない
 * データはすべて使い捨て（顧客・担当者・受講生）。記録はDBに直接作る（トレーニングの実施は音声の入出力が必要なため）。
 */

const PASSWORD = "MonitorPeriod2026a";

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;

test.afterEach(async () => {
  if (fixture) await fixture.admin.from("com_t_user_role").delete().in("user_id", fixture.userIds).eq("role_id", "monitor");
  // 記録・通算値・通知は受講生の削除で連鎖削除される
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

test("期間は日本時間で区切り、各実績は生徒のタイムゾーンでの実施日で出る", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  test.setTimeout(120_000);

  const f = await createAuthFixture("monper");
  fixture = f;
  const { admin } = f;

  // 担当者（モニターロール。ニューヨーク在住として閲覧する）
  const monitorEmail = `${f.tag}-monitor@${DISPOSABLE_EMAIL_DOMAIN}`;
  const monitorId = await createDisposableStudent(f, { email: monitorEmail, password: PASSWORD, userName: `E2E担当者（${f.tag}）` });
  await grantAppLicense(f, monitorId);
  await admin.from("com_m_user").update({ timezone: "America/New_York" }).eq("id", monitorId);
  const { error: roleError } = await admin.from("com_t_user_role").insert({ user_id: monitorId, role_id: "monitor" });
  if (roleError) throw new Error(`モニターロールの付与に失敗しました: ${roleError.message}`);

  // 受講生（日本。契約は 2026-09-01 0:00 JST 〜 2026-11-30 JST）
  const studentName = `E2E受講生（${f.tag}）`;
  const studentId = await createDisposableStudent(f, {
    email: `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`,
    password: PASSWORD,
    userName: studentName,
  });
  await grantAppLicense(f, studentId, { start: new Date("2026-08-31T15:00:00Z"), end: new Date("2026-11-30T14:59:59.999Z") });

  const { data: sprint } = await admin.from("com_m_contents").select("content_id").eq("content_type", 2).eq("delete_flg", "0").limit(1).single();
  if (!sprint) throw new Error("スプリントの教材が見つかりません");
  const { error: sprintError } = await admin.from("self_t_sprint").insert({
    user_id: studentId, sprint_type: "0", content_id: sprint.content_id, question_type: "0", answer_type: "0",
    difficulty_level: 1, time_limit_sec: 60, total_answered: 5, total_assessments: 0,
    insert_date: "2026-09-30T15:30:00Z", // 日本時間 2026-10-01 00:30（ニューヨークでは 9/30 11:30）
  });
  if (sprintError) throw new Error(`スプリントの記録の作成に失敗しました: ${sprintError.message}`);

  await loginAsNewStudent(page, monitorEmail, PASSWORD);

  await test.step("対象生徒: 9/1 JST 開始の契約の受講生は、8月に出ず9月に出る", async () => {
    await page.goto("/monitor?view=overview&startDate=2026-08-01&endDate=2026-08-31");
    await expect(page.getByText("この年月に該当する受講生が見つかりません")).toBeVisible();
    await page.goto("/monitor?view=overview&startDate=2026-09-01&endDate=2026-09-30");
    await expect(page.getByText(studentName).first()).toBeVisible();
  });

  await test.step("スプリントの履歴: 受講生の実施日（10/1 JST）で出る（担当者のタイムゾーンの 9/30 にならない）", async () => {
    await page.goto("/monitor?view=sprint&startDate=2026-09-01&endDate=2026-09-30");
    await expect(page.getByRole("heading", { name: "2026/09/30" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "2026/10/01" })).toHaveCount(0);
    await page.goto("/monitor?view=sprint&startDate=2026-10-01&endDate=2026-10-31");
    await expect(page.getByRole("heading", { name: "2026/10/01" })).toBeVisible();
  });
});
