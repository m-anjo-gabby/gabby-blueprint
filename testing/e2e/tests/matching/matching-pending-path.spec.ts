import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect, agreeToPendingTerms } from "../../support/studentApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableCoach,
  createDisposableStudent,
  deleteFixtureChatRooms,
  grantLiveLicense,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { QA_ADMIN_EMAIL } from "../../support/adminApp.ts";
import { getPersonaPassword } from "../../support/personas.ts";

/**
 * 承認待ちのマッチング申請への導線（画面: docs/screens/student/coach-matching.md・docs/screens/student/live-room/hub.md）。
 * 週2回の契約で1コマ目が成立済み・2コマ目が承認待ちの場合、マッチング画面を離れても、
 * ホームの回答待ちの案内 → ライブセッション管理の「契約の状況」のコマの「確認・取り下げ」 → マッチング画面で取り下げられる。
 * 承認待ちは生徒の対応ではないため、「対応が必要です」には出さない。
 */

const PASSWORD = "MatchPendingPass2026a";
const DAY_MS = 24 * 60 * 60 * 1000;

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;
let adminClient: SupabaseClient | undefined;

test.afterEach(async () => {
  if (adminClient) await signOutRole(adminClient);
  adminClient = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

test("承認待ちのコマは、ホーム・ライブセッション管理からマッチング画面へ戻って取り下げられる", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  fixture = await createAuthFixture("matchpend");
  const f = fixture;
  const now = Date.now();

  const studentEmail = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password: PASSWORD });
  const { ticketId } = await grantLiveLicense(f, studentId, {
    planCode: "LIVE_WEEKLY2_3M",
    label: "pend",
    start: new Date(now - DAY_MS),
    end: new Date(now + 90 * DAY_MS),
  });
  const coach = (suffix: string) =>
    createDisposableCoach(f, {
      email: `${f.tag}-coach${suffix}@${DISPOSABLE_EMAIL_DOMAIN}`,
      password: PASSWORD,
      userName: `E2Eコーチ${suffix} ${f.tag}`,
      timezone: "Asia/Tokyo",
      availability: [{ dayOfWeek: 5, startTime: "10:00:00", endTime: "13:00:00" }],
    });
  const coachA = await coach("a");
  const coachB = await coach("b");

  // 1コマ目: 成立済み（アドミンの直接マッチング）／2コマ目: 承認待ち
  adminClient = await signInAsRole(QA_ADMIN_EMAIL, getPersonaPassword());
  const { error: matchError } = await adminClient.rpc("admin_match_student_with_coach", {
    p_ticket_id: ticketId, p_coach_id: coachA, p_slot_no: 1, p_day_of_week: 5, p_start_time: "19:00:00", p_end_time: "19:25:00",
  });
  expect(matchError).toBeNull();
  const { data: pending, error: pendingError } = await f.admin
    .from("com_t_matching_request")
    .insert({
      ticket_id: ticketId, student_id: studentId, coach_id: coachB, slot_no: 2,
      requested_day_of_week: 5, requested_start_time: "20:00:00", requested_end_time: "20:25:00", requested_timezone: "Asia/Tokyo",
    })
    .select("request_id")
    .single();
  expect(pendingError).toBeNull();

  await page.goto("/login");
  await page.locator("input[name=email]").fill(studentEmail);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL("**/dashboard");
  const termsDialog = page.getByRole("dialog", { name: "利用規約への同意" });
  await expect(termsDialog).toBeVisible();
  await agreeToPendingTerms(page);
  await expect(termsDialog).toHaveCount(0);

  // 1. ホーム: 回答待ちの案内（ライブセッション管理へ）
  const waitingLink = page.getByRole("link", { name: "専属コーチの回答待ちのリクエストが1件あります" });
  await expect(waitingLink).toBeVisible();
  await waitingLink.click();
  await page.waitForURL("**/live-room**");

  // 2. ライブセッション管理: 承認待ちは「対応が必要です」に出さず、契約の状況のコマに回答期限と「確認・取り下げ」を出す
  await expect(page.getByText("対応が必要です")).toHaveCount(0);
  await expect(page.getByText(/回答待ち（期限/)).toBeVisible();
  await page.getByRole("link", { name: "確認・取り下げ" }).click();
  await page.waitForURL(`**/coach-matching?contract=${ticketId}`);

  // 3. マッチング画面で取り下げる
  await page.getByRole("button", { name: "リクエストを取り下げる" }).click();
  await page.getByRole("button", { name: "取り下げる", exact: true }).click();
  await expect(page.getByText("リクエストを取り下げました")).toBeVisible();
  const { data: withdrawn } = await f.admin.from("com_t_matching_request").select("status").eq("request_id", pending!.request_id).single();
  expect(withdrawn!.status).toBe(4);
});
