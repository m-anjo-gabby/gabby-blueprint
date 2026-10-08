import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFirstLiveSessionOccurrence } from "@gabby/lib/date/date";
import { formatReminderSchedule } from "@gabby/lib/mail/templates/reminder";
import { formatWeeklySlot } from "@gabby/lib/mail/templates/scheduleFormat";
import { signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  grantLiveLicense,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { cronSecret, invokeMailDispatch } from "../../support/mailDispatch.ts";
import { getPersonaPassword } from "../../support/personas.ts";
import { resendReadApiKey, resendTestAddress, waitForEmail } from "../../support/resendInbox.ts";

/**
 * 出来事の通知メールに載せる対象の情報（testing/e2e/specs/notification/mail-dispatch.md「対象の日時」）。
 * コーチが実際の RPC（実際にサインインしたコーチの JWT）でキャンセル（振替候補あり）・予約申請の否認・マッチングの否認を行い、
 * 送る直前に業務データから読んだ日時・振替候補・理由が、生徒に届いたメールの件名・本文に載ることを確かめる。
 * マッチング成立は承認の処理が重いため、通知を直接登録し、作られた初回のセッションから曜日・時間が出ることだけを確かめる。
 * 文面の細部（書式・英語・古い通知）は testing/unit/notification-mail-details.test.ts で検証する。
 * 使い捨ての顧客・生徒で行い、テストの最後に削除する。コーチは固定アカウント（qa-coach-us-01）で、操作の対象は使い捨ての担当枠だけ。
 */

const COACH_EMAIL = "qa-coach-us-01@gabby-qa-test.example";
const STUDENT_TZ = "Asia/Tokyo";
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MS = 25 * 60 * 1000;

let fixture: AuthFixture | undefined;
let coachClient: SupabaseClient | undefined;
const sessionIds: string[] = [];

test.afterAll(async () => {
  if (coachClient) await signOutRole(coachClient);
  // セッションはチケットを直接参照しているため、契約・チケットの削除（cleanupAuthFixture）より先に消す
  // （振替候補・予約申請・マッチングの申請は担当枠・チケットとともに消える）
  if (fixture && sessionIds.length > 0) await fixture.admin.from("com_t_session").delete().in("session_id", sessionIds);
  await cleanupAuthFixture(fixture);
});

/** 分単位の端数を付けた日時（固定アカウントのコーチの既存の予定と重ならないようにする） */
function at(offsetMs: number, minute: number): Date {
  const date = new Date(Date.now() + offsetMs);
  date.setUTCMinutes(minute, 0, 0);
  return date;
}

const label = (start: Date, end: Date | null) =>
  formatReminderSchedule({ startIso: start.toISOString(), endIso: end ? end.toISOString() : null, timeZone: STUDENT_TZ, language: "ja" });

test("キャンセル（振替候補あり）・予約申請の否認・マッチングの成立と否認のメールに、対象の日時と理由が載る", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "メール送信は desktop のみ");
  test.skip(!resendReadApiKey() || !cronSecret(), "RESEND_TEST_READ_API_KEY または CRON_SECRET が未設定");

  fixture = await createAuthFixture("mail");
  const f = fixture;
  const email = resendTestAddress(`${f.tag}-details`);
  const studentId = await createDisposableStudent(f, { email, password: getPersonaPassword(), userName: "E2E日時" });
  const { ticketId } = await grantLiveLicense(f, studentId, {
    planCode: "LIVE_WEEKLY1_3M",
    label: "live",
    start: new Date(Date.now() - DAY_MS),
    end: new Date(Date.now() + 60 * DAY_MS),
  });
  const { data: coach } = await f.admin.from("com_m_user").select("id, user_name, timezone").eq("user_name", "QAコーチUS01").single();
  if (!coach) throw new Error("固定アカウントのコーチが見つからない");
  const { data: schedule, error: scheduleError } = await f.admin
    .from("com_m_lesson_schedule")
    .insert({
      ticket_id: ticketId,
      student_id: studentId,
      coach_id: coach.id,
      slot_no: 1,
      day_of_week: 0,
      start_time: "03:00",
      end_time: "03:25",
      schedule_timezone: coach.timezone,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 60 * DAY_MS).toISOString().slice(0, 10),
      target_sessions: 12,
    })
    .select("schedule_id")
    .single();
  if (scheduleError || !schedule) throw new Error(`担当枠の作成に失敗: ${scheduleError?.message}`);

  const createSession = async (start: Date) => {
    const { data, error } = await f.admin
      .from("com_t_session")
      .insert({
        schedule_id: schedule.schedule_id,
        ticket_id: ticketId,
        student_id: studentId,
        coach_id: coach.id,
        start_datetime: start.toISOString(),
        end_datetime: new Date(start.getTime() + SESSION_MS).toISOString(),
        status: 1,
      })
      .select("session_id")
      .single();
    if (error || !data) throw new Error(`セッションの作成に失敗: ${error?.message}`);
    sessionIds.push(data.session_id as string);
    return data.session_id as string;
  };
  // キャンセルする回（3日後）と、残る初回の回（7日後。マッチング成立の「初回」）
  const cancelledStart = at(3 * DAY_MS, 13);
  const cancelledId = await createSession(cancelledStart);
  const firstStart = at(7 * DAY_MS, 17);
  await createSession(firstStart);

  coachClient = await signInAsRole(COACH_EMAIL, getPersonaPassword());

  // 1. コーチのキャンセル（振替候補2件）
  const proposals = [at(4 * DAY_MS, 19), at(5 * DAY_MS, 23)];
  const { error: cancelError } = await coachClient.rpc("cancel_session", {
    p_session_id: cancelledId,
    p_reason: "E2E",
    p_proposed_slots: proposals.map((start) => ({
      start_datetime: start.toISOString(),
      end_datetime: new Date(start.getTime() + SESSION_MS).toISOString(),
    })),
  });
  expect(cancelError).toBeNull();

  // 2. 予約申請（自由予約リクエスト）の否認。payload に申請のID（proposal_id）が入る
  const requestedStart = at(6 * DAY_MS, 29);
  const { data: bookingRequest, error: bookingError } = await f.admin
    .from("com_t_session_slot_proposal")
    .insert({
      schedule_id: schedule.schedule_id,
      student_id: studentId,
      coach_id: coach.id,
      proposed_start_datetime: requestedStart.toISOString(),
      proposed_end_datetime: new Date(requestedStart.getTime() + SESSION_MS).toISOString(),
      proposed_by_role: 1,
      status: 1,
    })
    .select("proposal_id")
    .single();
  if (bookingError || !bookingRequest) throw new Error(`予約申請の作成に失敗: ${bookingError?.message}`);
  expect((await coachClient.rpc("reject_slot_proposal", { p_proposal_id: bookingRequest.proposal_id, p_reason: "E2E: 予約の否認理由" })).error).toBeNull();

  // 3. マッチングの否認（生徒の現地時刻の 金曜 20:00〜20:25。申請時の生徒のタイムゾーンで持つ）。payload に申請のID（request_id）が入る
  const { data: matchingRequest, error: matchingError } = await f.admin
    .from("com_t_matching_request")
    .insert({
      ticket_id: ticketId,
      student_id: studentId,
      coach_id: coach.id,
      slot_no: 1,
      requested_day_of_week: 5,
      requested_start_time: "20:00",
      requested_end_time: "20:25",
      requested_timezone: STUDENT_TZ,
    })
    .select("request_id")
    .single();
  if (matchingError || !matchingRequest) throw new Error(`マッチングの申請の作成に失敗: ${matchingError?.message}`);
  expect((await coachClient.rpc("reject_matching_request", { p_request_id: matchingRequest.request_id, p_reason: "E2E: マッチングの否認理由" })).error).toBeNull();

  // 4. マッチング成立（通知を直接登録。初回のセッションは 7日後の回）
  const { error: approvedError } = await f.admin.from("com_t_notification").insert({
    user_id: studentId,
    notification_type: "MATCHING_APPROVED",
    payload: { coach_name: coach.user_name, schedule_id: schedule.schedule_id },
    link_path: "/live-room",
  });
  if (approvedError) throw new Error(approvedError.message);

  const { data: notifications } = await f.admin
    .from("com_t_notification")
    .select("notification_type, payload")
    .eq("user_id", studentId)
    .order("occurred_at");
  const payloadOf = (type: string) => notifications?.find((n) => n.notification_type === type)?.payload as Record<string, unknown> | undefined;
  expect(payloadOf("SESSION_RESCHEDULE_PROPOSED")?.proposal_count).toBe(2);
  expect(payloadOf("SESSION_BOOKING_REJECTED")?.proposal_id).toBe(bookingRequest.proposal_id);
  expect(payloadOf("MATCHING_REJECTED")?.request_id).toBe(matchingRequest.request_id);

  const since = new Date();
  expect((await invokeMailDispatch()).status()).toBe(200);
  const { data: outbox } = await f.admin.from("com_t_mail_outbox").select("status, last_error").eq("user_id", studentId);
  expect(outbox?.map((r) => [r.status, r.last_error])).toEqual(Array(4).fill(["SENT", null]));

  const end = (start: Date) => new Date(start.getTime() + SESSION_MS);

  const reschedule = await waitForEmail({ to: email, since, subject: /セッションのキャンセルと振替候補/ });
  expect(reschedule.html).toContain("セッションがキャンセルされました（振替候補あり）");
  expect(reschedule.text).toContain(`【キャンセルされたセッション】\n${label(cancelledStart, end(cancelledStart))}`);
  expect(reschedule.text).toContain(`【振替候補1】\n${label(proposals[0], end(proposals[0]))}`);
  expect(reschedule.text).toContain(`【振替候補2】\n${label(proposals[1], end(proposals[1]))}`);
  expect(reschedule.text).toContain("までにお選びください。");

  const bookingRejected = await waitForEmail({ to: email, since, subject: /予約リクエストについて/ });
  expect(bookingRejected.text).toContain(`【リクエストした日時】\n${label(requestedStart, end(requestedStart))}`);
  expect(bookingRejected.text).toContain("【理由】\nE2E: 予約の否認理由");

  const approved = await waitForEmail({ to: email, since, subject: /マッチングが成立しました/ });
  expect(approved.text).toContain(`【初回のセッション】\n${label(firstStart, end(firstStart))}`);
  expect(approved.text).toContain(
    `【曜日・時間】\n${formatWeeklySlot({ startIso: firstStart.toISOString(), endIso: end(firstStart).toISOString(), timeZone: STUDENT_TZ, language: "ja" })}`
  );

  const matchingRejected = await waitForEmail({ to: email, since, subject: /マッチングについて/ });
  const { instant } = getFirstLiveSessionOccurrence(5, "20:00", STUDENT_TZ, STUDENT_TZ);
  expect(matchingRejected.text).toContain(
    `【ご希望の曜日・時間】\n${formatWeeklySlot({ startIso: instant.toISOString(), endIso: end(instant).toISOString(), timeZone: STUDENT_TZ, language: "ja" })}`
  );
  expect(matchingRejected.text).toContain("【理由】\nE2E: マッチングの否認理由");
});
