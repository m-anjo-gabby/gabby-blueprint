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
 * 専属コーチのマッチングは、契約期間内に予約できる回数の割合（DB の matching_min_bookable_rate()）で申請・承認を判断する
 * （画面: docs/screens/student/coach-matching.md・docs/screens/coach/matching-requests.md、
 *  仕様: testing/e2e/specs/matching/coach-matching.md）。
 * - 全ての回を予約できる枠は○、割合以上なら△（未予約の回の個別調整を了承して申請）、割合未満は×（申請できない）
 * - 申請の取り下げは確認のうえ行い、コーチにアプリ内の通知が届く
 * - 申請後にコーチの予定が埋まって割合を下回ると承認できない。割合以上なら重なる回を飛ばして成立し、成立通知に回数が入る
 * - 同じコーチ宛ての他の生徒の承認待ちの申請と重なる枠は申請できない（承認時は数えない）
 * - アドミンの直接マッチングは割合の基準を適用しない（予約できる回が0回の場合だけ失敗する）
 * - コーチ交代の後に別のコーチで成立させても、交代前に使った回と合わせて契約の回数を超えない
 * コーチの予定は休み（BLOCK）で作る（他の生徒の予定と同じく「予約できない回」として数えられる）。
 * 割合を 0.7〜0.8 のどちらに変えても成り立つ回数にしている（12回のコマで、△は2回・×は5回重ねる）。
 */

const PASSWORD = "MatchRatePass2026a";
const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;
let coachClient: SupabaseClient | undefined;
let adminClient: SupabaseClient | undefined;

test.afterEach(async () => {
  if (coachClient) await signOutRole(coachClient);
  coachClient = undefined;
  if (adminClient) await signOutRole(adminClient);
  adminClient = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** 日本時間の金曜 hour:minute の回の日付（日本時間の YYYY-MM-DD）。from 以降・to までに始まって終わる回 */
function fridayDatesJst(hour: number, from: number, to: number, minute = 0): string[] {
  const dates: string[] = [];
  for (let t = from - DAY_MS; t <= to; t += DAY_MS) {
    const jst = new Date(t + JST_OFFSET_MS);
    if (jst.getUTCDay() !== 5) continue;
    const start = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), hour, minute) - JST_OFFSET_MS;
    if (start >= from && start + 25 * 60 * 1000 <= to) dates.push(jst.toISOString().slice(0, 10));
  }
  return dates;
}

test("予約できる回数の割合で申請・承認を判断し、取り下げはコーチに通知される", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  fixture = await createAuthFixture("matchrate");
  const f = fixture;

  // 生徒（日本時間）: 週1回・12回のライブ付き契約
  const studentEmail = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password: PASSWORD });
  const now = Date.now();
  const licenseEnd = now + 90 * DAY_MS;
  const { ticketId } = await grantLiveLicense(f, studentId, {
    planCode: "LIVE_WEEKLY1_3M",
    label: "rate",
    start: new Date(now - DAY_MS),
    end: new Date(licenseEnd),
  });

  // コーチ（日本時間）: 空き時間は UTC の金曜 10:00〜13:00（日本時間 金曜 19:00〜22:00）
  const coachEmail = `${f.tag}-coach@${DISPOSABLE_EMAIL_DOMAIN}`;
  const coachName = `E2Eコーチ ${f.tag}`;
  const coachId = await createDisposableCoach(f, {
    email: coachEmail,
    password: PASSWORD,
    userName: coachName,
    timezone: "Asia/Tokyo",
    availability: [{ dayOfWeek: 5, startTime: "10:00:00", endTime: "13:00:00" }],
  });

  // コーチの休み: 20:00 は2回（△）、21:00 は5回（×）。19:00 は全て空き（○）。
  // 申請・承認は24時間後以降の回で数えるため、直近の回は避けて2回目以降に入れる。
  const from = now + DAY_MS + 60 * 60 * 1000;
  const fridays20 = fridayDatesJst(20, from, licenseEnd);
  const fridays21 = fridayDatesJst(21, from, licenseEnd);
  const block = (date: string, hour: number) => ({
    coach_id: coachId,
    exception_date: date,
    start_time: `${hour}:00:00`,
    end_time: `${hour}:25:00`,
    exception_type: "BLOCK",
  });
  const { error: blockError } = await f.admin
    .from("com_t_coach_availability_exception")
    .insert([...fridays20.slice(1, 3).map((d) => block(d, 20)), ...fridays21.slice(1, 6).map((d) => block(d, 21))]);
  expect(blockError).toBeNull();

  // 生徒: ログインして申請ダイアログを開く
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

  await page.goto("/coach-matching");
  const coachCard = page.locator("article").filter({ hasText: coachName });
  const openDialog = async () => {
    await coachCard.getByRole("button", { name: "カレンダーからリクエストする" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "金曜日 19:00 申請可能" })).toBeVisible();
    return dialog;
  };
  const requestPartialSlot = async () => {
    const dialog = await openDialog();
    await expect(dialog.getByRole("button", { name: "金曜日 21:00 受付終了" })).toBeDisabled();
    await dialog.getByRole("button", { name: "金曜日 20:00 申請可能（一部の回は個別に調整）" }).click();
    await expect(dialog).toContainText("コーチと個別に日時を調整してください");
    const submit = dialog.getByRole("button", { name: "リクエストを送信" });
    // 未予約の回の個別調整を了承するまで送信できない
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("未予約の回を個別に調整することを了承しました").check();
    await submit.click();
    await expect(dialog).toHaveCount(0);
  };

  // 1. △の枠を了承して申請する（申請時に予約できた回数が残る）
  await requestPartialSlot();
  const { data: first } = await f.admin
    .from("com_t_matching_request")
    .select("request_id, status, requested_bookable_sessions")
    .eq("ticket_id", ticketId)
    .single();
  expect(first!.status).toBe(1);
  expect(first!.requested_bookable_sessions).toBe(Math.min(12, fridays20.length - 2));

  // 2. 送信した直後の画面から取り下げる（確認ダイアログあり）。コーチにアプリ内の通知が届く
  await page.getByRole("button", { name: "リクエストを取り下げる" }).click();
  await page.getByRole("button", { name: "取り下げる", exact: true }).click();
  await expect(page.getByText("リクエストを取り下げました")).toBeVisible();
  const { data: withdrawn } = await f.admin.from("com_t_matching_request").select("status").eq("request_id", first!.request_id).single();
  expect(withdrawn!.status).toBe(4);
  const { data: coachNotices } = await f.admin
    .from("com_t_notification")
    .select("notification_type, payload")
    .eq("user_id", coachId)
    .eq("notification_type", "MATCHING_WITHDRAWN");
  expect(coachNotices).toHaveLength(1);
  expect((coachNotices![0].payload as { request_id: string }).request_id).toBe(first!.request_id);

  // 3. 同じ枠を申請し直す
  await requestPartialSlot();
  const { data: second } = await f.admin
    .from("com_t_matching_request")
    .select("request_id")
    .eq("ticket_id", ticketId)
    .eq("status", 1)
    .single();

  // 4. 申請後にコーチの予定が埋まり割合を下回ると、承認できない（承認画面の回数も承認不可）
  const extraDates = fridays20.slice(3, 6);
  const { error: extraError } = await f.admin.from("com_t_coach_availability_exception").insert(extraDates.map((d) => block(d, 20)));
  expect(extraError).toBeNull();
  coachClient = await signInAsRole(coachEmail, PASSWORD);
  const { data: availability } = await coachClient.rpc("get_matching_request_availability", { p_request_ids: [second!.request_id] });
  expect(availability).toHaveLength(1);
  expect(availability![0].is_acceptable).toBe(false);
  const { error: rejectedApprove } = await coachClient.rpc("approve_matching_request", { p_request_id: second!.request_id });
  expect(rejectedApprove?.message).toContain("INSUFFICIENT_BOOKABLE");

  // 5. 予定が空いて割合以上に戻れば承認でき、重なる回を飛ばして作られる。成立通知に回数が入る
  await f.admin.from("com_t_coach_availability_exception").delete().eq("coach_id", coachId).in("exception_date", extraDates).eq("start_time", "20:00:00");
  const { error: approveError } = await coachClient.rpc("approve_matching_request", { p_request_id: second!.request_id });
  expect(approveError).toBeNull();

  const expectedBooked = Math.min(12, fridays20.length - 2);
  const { data: schedule } = await f.admin.from("com_m_lesson_schedule").select("schedule_id, target_sessions").eq("ticket_id", ticketId).single();
  const { count: booked } = await f.admin
    .from("com_t_session")
    .select("session_id", { count: "exact", head: true })
    .eq("schedule_id", schedule!.schedule_id)
    .eq("status", 1);
  expect(booked).toBe(expectedBooked);

  const { data: approvedNotice } = await f.admin
    .from("com_t_notification")
    .select("payload")
    .eq("user_id", studentId)
    .eq("notification_type", "MATCHING_APPROVED")
    .single();
  expect(approvedNotice!.payload).toMatchObject({ booked_sessions: expectedBooked, target_sessions: schedule!.target_sessions });
});

test("他の生徒の承認待ちと重なる枠は申請できず、アドミンの直接マッチングは割合の基準を適用しない", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  fixture = await createAuthFixture("matchrate2");
  const f = fixture;
  const now = Date.now();
  const licenseEnd = now + 90 * DAY_MS;
  const period = { start: new Date(now - DAY_MS), end: new Date(licenseEnd) };

  const studentEmail = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password: PASSWORD });
  const { ticketId } = await grantLiveLicense(f, studentId, { planCode: "LIVE_WEEKLY1_3M", label: "a", ...period });
  const otherId = await createDisposableStudent(f, { email: `${f.tag}-other@${DISPOSABLE_EMAIL_DOMAIN}`, password: PASSWORD });
  const { ticketId: otherTicketId } = await grantLiveLicense(f, otherId, { planCode: "LIVE_WEEKLY1_3M", label: "b", ...period });

  const coachEmail = `${f.tag}-coach@${DISPOSABLE_EMAIL_DOMAIN}`;
  const coachName = `E2Eコーチ ${f.tag}`;
  const coachId = await createDisposableCoach(f, {
    email: coachEmail,
    password: PASSWORD,
    userName: coachName,
    timezone: "Asia/Tokyo",
    availability: [{ dayOfWeek: 5, startTime: "10:00:00", endTime: "13:00:00" }],
  });

  // 他の生徒が 金曜 20:00（日本時間）を承認待ちで申請している
  const { error: otherError } = await f.admin.from("com_t_matching_request").insert({
    ticket_id: otherTicketId,
    student_id: otherId,
    coach_id: coachId,
    slot_no: 1,
    requested_day_of_week: 5,
    requested_start_time: "20:00:00",
    requested_end_time: "20:25:00",
    requested_timezone: "Asia/Tokyo",
  });
  expect(otherError).toBeNull();

  // 1. 生徒の申請カレンダーでは、他の生徒の承認待ちと重なる 20:00 は受付終了。重ならない 19:00 は申請できる
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
  await page.goto("/coach-matching");
  await page.locator("article").filter({ hasText: coachName }).getByRole("button", { name: "カレンダーからリクエストする" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "金曜日 19:00 申請可能" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "金曜日 20:00 受付終了" })).toBeDisabled();
  await dialog.getByRole("button", { name: "キャンセル" }).click();

  // 2. アドミンの直接マッチング: 全ての回がコーチの休みと重なる 21:30 は成立しない
  adminClient = await signInAsRole(QA_ADMIN_EMAIL, getPersonaPassword());
  const block = (date: string, start: string, end: string) => ({
    coach_id: coachId, exception_date: date, start_time: start, end_time: end, exception_type: "BLOCK",
  });
  const allFridays2130 = fridayDatesJst(21, now, licenseEnd, 30);
  const { error: blockAllError } = await f.admin
    .from("com_t_coach_availability_exception")
    .insert(allFridays2130.map((d) => block(d, "21:30:00", "21:55:00")));
  expect(blockAllError).toBeNull();
  const match = (startTime: string, endTime: string) =>
    adminClient!.rpc("admin_match_student_with_coach", {
      p_ticket_id: ticketId, p_coach_id: coachId, p_slot_no: 1, p_day_of_week: 5, p_start_time: startTime, p_end_time: endTime,
    });
  const { error: noBookableError } = await match("21:30:00", "21:55:00");
  expect(noBookableError?.message).toContain("NO_BOOKABLE_SESSION");

  // 3. 割合に満たない 21:00（5回が休みと重なる）でも、アドミンの直接マッチングは成立し、重なる回を飛ばして作る
  const fridays21 = fridayDatesJst(21, now, licenseEnd);
  const blocked21 = fridays21.slice(1, 6);
  const { error: blockError } = await f.admin
    .from("com_t_coach_availability_exception")
    .insert(blocked21.map((d) => block(d, "21:00:00", "21:25:00")));
  expect(blockError).toBeNull();
  const { error: matchError } = await match("21:00:00", "21:25:00");
  expect(matchError).toBeNull();

  const { data: schedule } = await f.admin.from("com_m_lesson_schedule").select("schedule_id").eq("ticket_id", ticketId).single();
  const { count: booked } = await f.admin
    .from("com_t_session")
    .select("session_id", { count: "exact", head: true })
    .eq("schedule_id", schedule!.schedule_id)
    .eq("status", 1);
  expect(booked).toBe(Math.min(12, fridays21.length - blocked21.length));

  // 他の生徒の承認待ちは、アドミンの操作の後も承認待ちのまま
  const { data: other } = await f.admin.from("com_t_matching_request").select("status").eq("ticket_id", otherTicketId).single();
  expect(other!.status).toBe(1);
});

test("コーチ交代の後に別のコーチで成立させても、交代前に使った回と合わせて契約の回数を超えない", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  fixture = await createAuthFixture("matchrate3");
  const f = fixture;
  const now = Date.now();
  const studentId = await createDisposableStudent(f, { email: `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`, password: PASSWORD });
  const { ticketId } = await grantLiveLicense(f, studentId, {
    planCode: "LIVE_WEEKLY1_3M",
    label: "change",
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

  adminClient = await signInAsRole(QA_ADMIN_EMAIL, getPersonaPassword());
  const match = (coachId: string, startTime: string, endTime: string) =>
    adminClient!.rpc("admin_match_student_with_coach", {
      p_ticket_id: ticketId, p_coach_id: coachId, p_slot_no: 1, p_day_of_week: 5, p_start_time: startTime, p_end_time: endTime,
    });
  const sessionsOf = async (scheduleId: string) => {
    const { data } = await f.admin.from("com_t_session").select("session_id, status").eq("schedule_id", scheduleId).order("start_datetime");
    return data!;
  };

  // 1. コーチAで成立し、最初の4回を実施済みにする（実施済みの回は交代後も契約の回数を使ったまま）
  const { error: matchAError } = await match(coachA, "19:00:00", "19:25:00");
  expect(matchAError).toBeNull();
  const { data: scheduleA } = await f.admin.from("com_m_lesson_schedule").select("schedule_id, target_sessions").eq("ticket_id", ticketId).single();
  expect(scheduleA!.target_sessions).toBe(12);
  const sessionsA = await sessionsOf(scheduleA!.schedule_id);
  const usedIds = sessionsA.slice(0, 4).map((s) => s.session_id);
  const { error: completeError } = await f.admin
    .from("com_t_session")
    .update({ status: 2, completion_result: 1 })
    .in("session_id", usedIds);
  expect(completeError).toBeNull();

  // 2. コーチ交代（残りの回はキャンセルされ、返還される）→ コーチBで成立
  const { error: releaseError } = await adminClient.rpc("release_lesson_schedule_slot", { p_schedule_id: scheduleA!.schedule_id });
  expect(releaseError).toBeNull();
  const { error: matchBError } = await match(coachB, "20:00:00", "20:25:00");
  expect(matchBError).toBeNull();

  // 3. コーチBの目標回数は残りの8回。未予約を多く数えず、実施済みと合わせて契約の12回を超えない
  const { data: scheduleB } = await f.admin
    .from("com_m_lesson_schedule")
    .select("schedule_id, target_sessions")
    .eq("ticket_id", ticketId)
    .eq("status", 1)
    .single();
  expect(scheduleB!.target_sessions).toBe(8);
  const { data: shortfall } = await f.admin.rpc("fn_schedule_shortfall", { p_schedule_id: scheduleB!.schedule_id }).single();
  const createdB = (await sessionsOf(scheduleB!.schedule_id)).length;
  expect(createdB + (shortfall as { shortfall: number }).shortfall).toBe(8);
  const { count: usedTotal } = await f.admin
    .from("com_t_session")
    .select("session_id", { count: "exact", head: true })
    .eq("ticket_id", ticketId)
    .in("status", [1, 2]);
  expect(usedTotal).toBeLessThanOrEqual(12);
});
