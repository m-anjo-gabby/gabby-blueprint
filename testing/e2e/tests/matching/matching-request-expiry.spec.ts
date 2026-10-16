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

/**
 * 専属コーチのマッチング申請の回答期限（申請から24時間。DB の matching_request_ttl()）
 * （画面: docs/screens/student/coach-matching.md・docs/screens/coach/matching-requests.md、
 *  仕様: testing/e2e/specs/matching/coach-matching.md）。
 * - 申請するとコーチへ MATCHING_REQUESTED（回答期限つき。メールも積まれる）が届く
 * - 期限を過ぎた申請は、期限切れの処理（毎分）を待たずに承認できず、生徒の画面では未マッチングに戻って期限切れの旨を出す
 * - 期限切れの処理で status=6 になり、生徒へ MATCHING_EXPIRED が届く
 * - 期限を過ぎた直後でも、同じコマへ申請し直せる（登録時に同じコマの期限切れを先に処理する）
 * 24時間待てないため、期限（expires_at）を過去に書き換えて確かめる。
 */

const PASSWORD = "MatchExpiryPass2026a";
const DAY_MS = 24 * 60 * 60 * 1000;

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;
let coachClient: SupabaseClient | undefined;

test.afterEach(async () => {
  if (coachClient) await signOutRole(coachClient);
  coachClient = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

test("申請の回答期限（24時間）を過ぎると承認できず、生徒に通知され、申請し直せる", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  fixture = await createAuthFixture("matchexp");
  const f = fixture;
  const now = Date.now();

  const studentEmail = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password: PASSWORD });
  const { ticketId } = await grantLiveLicense(f, studentId, {
    planCode: "LIVE_WEEKLY1_3M",
    label: "exp",
    start: new Date(now - DAY_MS),
    end: new Date(now + 90 * DAY_MS),
  });
  const coachEmail = `${f.tag}-coach@${DISPOSABLE_EMAIL_DOMAIN}`;
  const coachName = `E2Eコーチ ${f.tag}`;
  const coachId = await createDisposableCoach(f, {
    email: coachEmail,
    password: PASSWORD,
    userName: coachName,
    timezone: "Asia/Tokyo",
    availability: [{ dayOfWeek: 5, startTime: "10:00:00", endTime: "13:00:00" }],
  });

  await page.goto("/login");
  await page.locator("input[name=email]").fill(studentEmail);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL("**/dashboard");
  // 利用規約の同意ダイアログが出るのを待ってから同意する（出る前に同意すると何もせずに終わる）
  const termsDialog = page.getByRole("dialog", { name: "利用規約への同意" });
  await expect(termsDialog).toBeVisible();
  await agreeToPendingTerms(page);
  await expect(termsDialog).toHaveCount(0);

  const sendRequest = async () => {
    await page.goto("/coach-matching");
    await page.locator("article").filter({ hasText: coachName }).getByRole("button", { name: "カレンダーからリクエストする" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("コーチは24時間以内に回答します");
    await dialog.getByRole("button", { name: "金曜日 20:00 申請可能" }).click();
    await dialog.getByRole("button", { name: "リクエストを送信" }).click();
    await expect(dialog).toHaveCount(0);
  };
  const pendingRequest = async () => {
    const { data } = await f.admin
      .from("com_t_matching_request")
      .select("request_id, insert_date, expires_at")
      .eq("ticket_id", ticketId)
      .eq("status", 1)
      .single();
    return data!;
  };
  const expireNow = (requestId: string) =>
    f.admin.from("com_t_matching_request").update({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() }).eq("request_id", requestId);

  // 1. 申請すると、回答期限（登録から24時間）が入り、枠に期限が出る。コーチへ期限つきの通知とメールが積まれる
  await sendRequest();
  await expect(page.getByText("コーチの回答期限:")).toBeVisible();
  const first = await pendingRequest();
  expect(new Date(first.expires_at).getTime() - new Date(first.insert_date).getTime()).toBe(DAY_MS);
  const { data: requested } = await f.admin
    .from("com_t_notification")
    .select("notification_id, payload")
    .eq("user_id", coachId)
    .eq("notification_type", "MATCHING_REQUESTED")
    .single();
  expect(requested!.payload).toMatchObject({ request_id: first.request_id });
  const { count: queuedMails } = await f.admin
    .from("com_t_mail_outbox")
    .select("mail_id", { count: "exact", head: true })
    .eq("user_id", coachId)
    .eq("dedup_key", requested!.notification_id);
  expect(queuedMails).toBe(1);

  // 2. 期限を過ぎると、期限切れの処理を待たずに承認できない。生徒の画面では未マッチングに戻り、期限切れの旨を出す
  await expireNow(first.request_id);
  coachClient = await signInAsRole(coachEmail, PASSWORD);
  const { error: approveError } = await coachClient.rpc("approve_matching_request", { p_request_id: first.request_id });
  expect(approveError?.message).toContain("EXPIRED");
  await page.reload();
  await expect(page.getByText("前回のリクエストは、コーチの回答期限（24時間）を過ぎたため無効になりました")).toBeVisible();

  // 3. 期限切れの処理で期限切れ（6）になり、生徒へ通知される（毎分の処理が先に済ませていてもよい）
  const { error: expireError } = await f.admin.rpc("fn_expire_matching_requests");
  expect(expireError).toBeNull();
  const { data: expired } = await f.admin.from("com_t_matching_request").select("status").eq("request_id", first.request_id).single();
  expect(expired!.status).toBe(6);
  const { data: expiredNotices } = await f.admin
    .from("com_t_notification")
    .select("payload")
    .eq("user_id", studentId)
    .eq("notification_type", "MATCHING_EXPIRED");
  expect(expiredNotices).toHaveLength(1);
  expect(expiredNotices![0].payload).toMatchObject({ request_id: first.request_id, coach_name: coachName });

  // 4. 申請し直す。期限を過ぎた直後（期限切れの処理の前）でも、同じコマへ申請し直せる
  await sendRequest();
  const second = await pendingRequest();
  await expireNow(second.request_id);
  await sendRequest();
  const third = await pendingRequest();
  expect(third.request_id).not.toBe(second.request_id);
  const { data: secondAfter } = await f.admin.from("com_t_matching_request").select("status").eq("request_id", second.request_id).single();
  expect(secondAfter!.status).toBe(6);
});
