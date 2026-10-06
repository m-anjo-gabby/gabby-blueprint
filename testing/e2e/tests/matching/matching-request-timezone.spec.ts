import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect, agreeToPendingTerms } from "../../support/studentApp.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  grantLiveLicense,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { signInAsRole, signOutRole } from "../../../helpers/auth.ts";

/**
 * 専属コーチのマッチングは、生徒が選んだ時刻（申請時の生徒のタイムゾーン）で全回を予約する
 * （画面: docs/screens/student/coach-matching.md・docs/screens/coach/matching-requests.md）。
 * コーチの空き時間は UTC で持ち、生徒の画面では生徒のタイムゾーンで表示する。夏時間のあるコーチ（ニューヨーク）でも、
 * 契約期間中の全回が生徒側で同じ時刻になること（コーチ側の時刻は夏時間の切り替えで変わってよい）を確かめる。
 * 使い捨ての生徒（日本時間）とコーチを作り、生徒は画面から申請し、コーチは本人のログインで承認する。
 */

const PASSWORD = "MatchTzPass2026a";
const DAY_MS = 24 * 60 * 60 * 1000;

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;
let coachClient: SupabaseClient | undefined;

test.afterEach(async () => {
  if (coachClient) await signOutRole(coachClient);
  coachClient = undefined;
  if (fixture) {
    // 成立時にコーチと生徒の1対1のチャットルームが作られる（ユーザーの削除ではルーム自体は消えない）
    const { data: rooms } = await fixture.admin
      .from("com_t_chat_room_user").select("room_id").in("user_id", fixture.userIds);
    const roomIds = Array.from(new Set((rooms ?? []).map((r) => r.room_id)));
    if (roomIds.length > 0) await fixture.admin.from("com_t_chat_room").delete().in("room_id", roomIds);
  }
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

test("申請した生徒の時刻で全回が予約される（コーチの空き時間は UTC、コーチは夏時間のある地域）", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  fixture = await createAuthFixture("e2e-match-tz");
  const f = fixture;

  // 生徒（日本時間）: 週1回のライブ付き契約（90日。北米の夏時間の切り替えをまたぎ得る）
  const studentEmail = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password: PASSWORD });
  const now = Date.now();
  const { ticketId } = await grantLiveLicense(f, studentId, {
    planCode: "LIVE_WEEKLY1_3M",
    label: "tz",
    start: new Date(now - DAY_MS),
    end: new Date(now + 90 * DAY_MS),
  });

  // コーチ（ニューヨーク）: 空き時間は UTC の金曜 10:00〜13:00（日本時間 金曜 19:00〜22:00）
  const coachEmail = `${f.tag}-coach@${DISPOSABLE_EMAIL_DOMAIN}`;
  const coachName = `E2Eコーチ ${f.tag}`;
  const { data: coachUser, error: coachError } = await f.admin.auth.admin.createUser({
    email: coachEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { user_name: coachName, user_type: "2" },
  });
  if (coachError || !coachUser.user) throw new Error(`コーチの作成に失敗しました: ${coachError?.message}`);
  const coachId = coachUser.user.id;
  f.userIds.push(coachId);
  await f.admin.from("com_m_user").update({ timezone: "America/New_York" }).eq("id", coachId);
  const { error: availabilityError } = await f.admin.from("com_m_coach_availability").insert({
    coach_id: coachId, day_of_week: 5, start_time: "10:00:00", end_time: "13:00:00",
  });
  if (availabilityError) throw new Error(availabilityError.message);

  // 生徒: 画面から 金曜 20:00（日本時間）を申請する
  await page.goto("/login");
  await page.locator("input[name=email]").fill(studentEmail);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL("**/dashboard");
  const termsDialog = page.getByRole("dialog", { name: "利用規約への同意" });
  await expect(termsDialog).toBeVisible();
  await agreeToPendingTerms(page);
  await expect(termsDialog).toHaveCount(0);

  await page.goto("/coach-matching");
  const coachCard = page.locator("article").filter({ hasText: coachName });
  await coachCard.getByRole("button", { name: "カレンダーからリクエストする" }).click();
  const dialog = page.getByRole("dialog");
  // UTC の空き時間が日本時間で表示される（金曜 19:00〜21:30 開始の枠）
  await expect(dialog.getByRole("button", { name: "金曜日 19:00 申請可能" })).toBeVisible();
  await dialog.getByRole("button", { name: "金曜日 20:00 申請可能" }).click();
  await expect(dialog).toContainText("毎週 金曜日 20:00 - 20:25");
  await dialog.getByRole("button", { name: "リクエストを送信" }).click();
  await expect(dialog).toHaveCount(0);

  const { data: request } = await f.admin
    .from("com_t_matching_request")
    .select("request_id, requested_day_of_week, requested_start_time, requested_timezone, status")
    .eq("ticket_id", ticketId)
    .single();
  expect(request).toMatchObject({ requested_day_of_week: 5, requested_start_time: "20:00:00", requested_timezone: "Asia/Tokyo", status: 1 });

  // コーチ: 本人のログインで承認する
  coachClient = await signInAsRole(coachEmail, PASSWORD);
  const { error: approveError } = await coachClient.rpc("approve_matching_request", { p_request_id: request!.request_id });
  expect(approveError).toBeNull();

  const { data: schedule } = await f.admin
    .from("com_m_lesson_schedule").select("schedule_id, schedule_timezone, day_of_week, start_time").eq("ticket_id", ticketId).single();
  expect(schedule).toMatchObject({ schedule_timezone: "Asia/Tokyo", day_of_week: 5, start_time: "20:00:00" });

  const { data: sessions } = await f.admin
    .from("com_t_session").select("start_datetime").eq("schedule_id", schedule!.schedule_id).order("start_datetime");
  expect(sessions!.length).toBeGreaterThan(0);
  const jst = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const studentTimes = new Set(sessions!.map((s) => jst.format(new Date(s.start_datetime))));
  // 生徒側は全回 金曜 20:00
  expect([...studentTimes]).toEqual([jst.format(new Date("2026-10-09T11:00:00Z"))]);
});
