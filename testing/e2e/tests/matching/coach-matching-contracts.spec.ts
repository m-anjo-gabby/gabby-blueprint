import type { Page } from "@playwright/test";
import { test, expect, agreeToPendingTerms } from "../../support/studentApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  grantLiveLicense,
  type AuthFixture,
} from "../../support/authFixtures.ts";

/**
 * 専属コーチを探す: 現在の契約と次の契約（継続用）を両方持つ生徒は、契約を切り替えて契約ごとに申請できる
 * （画面: docs/screens/student/coach-matching.md、ジャーニー: e2e/journeys/license-renewal.md 手順5）
 * 使い捨ての生徒に、週1回の現在の契約と週2回の次の契約を付けて、表示される枠の数で契約を見分ける。
 * 現在の契約がマッチング済みで次の契約が未選択の場合は、ホーム・ライブセッションホームで次の契約の申請を促す。
 */

const PASSWORD = "MatchPass2026a";
const DAY_MS = 24 * 60 * 60 * 1000;

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;

/** 使い捨ての生徒に、週1回の現在の契約と週2回の次の契約を付ける */
async function createStudentWithTwoContracts(f: AuthFixture): Promise<{ email: string; userId: string; currentTicketId: string; nextTicketId: string }> {
  const email = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const userId = await createDisposableStudent(f, { email, password: PASSWORD });
  const now = Date.now();
  const { ticketId: currentTicketId } = await grantLiveLicense(f, userId, {
    planCode: "LIVE_WEEKLY1_3M",
    label: "current",
    start: new Date(now - DAY_MS),
    end: new Date(now + 30 * DAY_MS),
  });
  const { ticketId: nextTicketId } = await grantLiveLicense(f, userId, {
    planCode: "LIVE_WEEKLY2_3M",
    label: "next",
    start: new Date(now + 31 * DAY_MS),
    end: new Date(now + 120 * DAY_MS),
  });
  return { email, userId, currentTicketId, nextTicketId };
}

/** ログインし、新規の生徒に出る規約同意を済ませる（同意の保存が終わる＝モーダルが閉じるまで待つ） */
async function loginAndAgree(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL("**/dashboard");
  const termsDialog = page.getByRole("dialog", { name: "利用規約への同意" });
  await expect(termsDialog).toBeVisible();
  await agreeToPendingTerms(page);
  await expect(termsDialog).toHaveCount(0);
}

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

test("現在の契約と次の契約を切り替えて、それぞれの枠を表示できる（既定は現在の契約）", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");

  fixture = await createAuthFixture("match");
  const { email, nextTicketId } = await createStudentWithTwoContracts(fixture);
  await loginAndAgree(page, email);

  await page.goto("/coach-matching");
  const contractSelect = page.getByRole("combobox", { name: "表示する契約" });
  await expect(contractSelect).toHaveText(/^現在の契約：/);
  await expect(page.getByText("1コマ目")).toBeVisible();
  await expect(page.getByText("2コマ目")).toHaveCount(0);

  await contractSelect.click();
  await page.getByRole("option", { name: /^次の契約：/ }).click();
  await page.waitForURL(`**/coach-matching?contract=${nextTicketId}`);
  await expect(contractSelect).toHaveText(/^次の契約：/);
  await expect(page.getByText("2コマ目")).toBeVisible();
});

test("現在の契約がマッチング済みで次の契約が未選択なら、次の契約の申請を促す", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");

  fixture = await createAuthFixture("match");
  const { email, userId, currentTicketId, nextTicketId } = await createStudentWithTwoContracts(fixture);
  // 現在の契約の1コマをマッチング済みにする（担当枠を直接作る。コーチは固定アカウント、後始末はチケットの削除で連鎖削除）
  const { data: coach } = await fixture.admin.from("com_m_user").select("id").eq("user_name", "QAコーチUS01").single();
  const { error } = await fixture.admin.from("com_m_lesson_schedule").insert({
    ticket_id: currentTicketId,
    student_id: userId,
    coach_id: coach!.id,
    slot_no: 1,
    day_of_week: 0,
    start_time: "03:00",
    end_time: "03:25",
    schedule_timezone: "America/New_York",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10),
    target_sessions: 12,
  });
  if (error) throw new Error(`担当枠の作成に失敗しました: ${error.message}`);
  await loginAndAgree(page, email);

  // ホーム: 次の契約の申請を促し、次の契約を選んだ申請画面へ
  const homeAction = page.getByRole("link", { name: /次の契約で2コマの専属コーチが未選択です/ });
  await expect(homeAction).toBeVisible();
  await expect(page.getByRole("link", { name: /^専属コーチが未選択です/ })).toHaveCount(0);
  await expect(homeAction).toHaveAttribute("href", `/coach-matching?contract=${nextTicketId}`);

  // ライブセッションホーム（現在の契約を表示中）: 対応が必要ですに次の契約の案内
  await page.goto("/live-room");
  await expect(page.getByText("次の契約の週2回のうち2コマの専属コーチが未選択です")).toBeVisible();
  await page.getByRole("link", { name: "コーチを選ぶ" }).click();
  await page.waitForURL(`**/coach-matching?contract=${nextTicketId}`);
  await expect(page.getByRole("combobox", { name: "表示する契約" })).toHaveText(/^次の契約：/);
});
