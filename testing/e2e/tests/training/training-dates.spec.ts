import type { Page } from "@playwright/test";
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
 * 実績の日付: 生徒のタイムゾーンでの実施日で数える（仕様: e2e/specs/training/training-stats.md 異常系 #10・#11）
 * - スプリントのセッション（日時はUTC）: 日本時間 10/1 8:00（UTC 9/30 23:00）の回は10月の実績
 * - 日次サマリー（日付だけ。記録時点のタイムゾーンで確定済み）: UTCより西のタイムゾーンでも同じ日付で出る
 * 記録は使い捨ての生徒にDBで直接作る（トレーニングの実施は音声の入出力が必要なため）。日付は固定の過去日。
 */

const PASSWORD = "TrainDate2026a";

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;

test.afterEach(async () => {
  if (fixture?.clientId) await fixture.admin.from("com_m_contents_access").delete().eq("client_id", fixture.clientId);
  // 記録・通算値・達成の通知は生徒の削除で連鎖削除される
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** 使い捨てのアプリのみ契約の生徒を作ってログインする */
async function startAsStudent(page: Page, timezone?: string): Promise<{ f: AuthFixture; userId: string }> {
  const f = await createAuthFixture("trdate");
  fixture = f;
  const email = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const userId = await createDisposableStudent(f, { email, password: PASSWORD });
  await grantAppLicense(f, userId);
  if (timezone) {
    const { error } = await f.admin.from("com_m_user").update({ timezone }).eq("id", userId);
    if (error) throw new Error(`タイムゾーンの設定に失敗しました: ${error.message}`);
  }
  await loginAsNewStudent(page, email, PASSWORD);
  return { f, userId };
}

/** トレーニング記録のカレンダーの実施日（例: 10月1日） */
const calendarDay = (page: Page, label: string) => page.getByRole("button", { name: `${label}の実施内容` });

test("日本時間の月初の早朝に実施したスプリントは、その月の実績になる", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");

  const { f, userId } = await startAsStudent(page);
  const { data: sprint, error } = await f.admin
    .from("com_m_contents")
    .select("content_id")
    .eq("content_type", 2)
    .eq("content_scope", 1)
    .eq("metadata->sprint->>sprint_type", "0")
    .limit(1)
    .single();
  if (error || !sprint) throw new Error(`汎用スプリントが見つかりません: ${error?.message}`);
  await f.admin.from("com_m_contents_access").insert({ client_id: f.clientId, content_id: sprint.content_id });
  const { error: insertError } = await f.admin.from("self_t_sprint").insert({
    user_id: userId,
    sprint_type: "0",
    content_id: sprint.content_id,
    question_type: "0",
    answer_type: "0",
    difficulty_level: 1,
    time_limit_sec: 60,
    total_answered: 5,
    total_assessments: 0,
    insert_date: "2026-09-30T23:00:00Z", // 日本時間 2026-10-01 08:00
  });
  if (insertError) throw new Error(`スプリントの記録の作成に失敗しました: ${insertError.message}`);

  await test.step("トレーニング記録: 10月1日に出て、9月には出ない", async () => {
    await page.goto("/training/performance?month=2026-10");
    await expect(calendarDay(page, "10月1日")).toBeVisible();
    await page.goto("/training/performance?month=2026-09");
    await expect(page.getByText("9月のまとめ")).toBeVisible();
    await expect(calendarDay(page, "9月30日")).toHaveCount(0);
  });

  await test.step("スプリントの履歴: 10月に出て、9月は空", async () => {
    await page.goto("/training/sprint/history?month=2026-10");
    await expect(page.getByText("2026/10/01")).toBeVisible();
    await page.goto("/training/sprint/history?month=2026-09");
    await expect(page.getByText("この月のスプリントの履歴はありません")).toBeVisible();
  });
});

test("UTCより西のタイムゾーンの生徒でも、単語帳の記録は記録した日付のまま出る", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");

  const { f, userId } = await startAsStudent(page, "America/New_York");
  const { data: word, error } = await f.admin
    .from("com_m_contents")
    .select("content_id")
    .eq("content_type", 0)
    .eq("content_scope", 0)
    .eq("delete_flg", "0")
    .limit(1)
    .single();
  if (error || !word) throw new Error(`共通公開の単語帳が見つかりません: ${error?.message}`);
  const { error: insertError } = await f.admin.from("self_t_word_summary").insert({
    user_id: userId,
    content_id: word.content_id,
    training_date: "2026-10-01",
    word_count: 3,
    phrase_count: 6,
    assessment_count: 2,
  });
  if (insertError) throw new Error(`単語帳の記録の作成に失敗しました: ${insertError.message}`);

  await test.step("単語帳の履歴: 2026/10/01 に出る（前日にずれない）", async () => {
    await page.goto("/training/word/history?month=2026-10");
    await expect(page.getByText("2026/10/01")).toBeVisible();
    await expect(page.getByText("2026/09/30")).toHaveCount(0);
  });

  await test.step("トレーニング記録: 10月1日に出る", async () => {
    await page.goto("/training/performance?month=2026-10");
    await expect(calendarDay(page, "10月1日")).toBeVisible();
  });
});
