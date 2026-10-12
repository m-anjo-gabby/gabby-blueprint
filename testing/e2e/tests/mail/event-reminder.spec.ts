import { expect, test } from "@playwright/test";
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  grantAppLicense,
  grantLiveLicense,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { cronSecret, invokeMailDispatch } from "../../support/mailDispatch.ts";
import { getPersonaPassword } from "../../support/personas.ts";
import { resendReadApiKey, resendTestAddress, waitForEmail } from "../../support/resendInbox.ts";

/**
 * グループセッションのリマインダーメール（docs/screens/student/dashboard.md「グループセッション」、
 * 送信処理: packages/lib/mail/dispatch/）。pg_cron の代わりに送信処理（admin の /api/cron/mail-dispatch）を呼び、
 * 送信待ち（com_t_mail_outbox）の状態と、Resend のテスト用アドレスに届いたメールを確かめる。
 * 文面の細部は testing/unit/event-reminder-mail-content.test.ts で検証する。
 * 使い捨ての顧客・生徒・イベントを作り、テストの最後に削除する（送信待ち・配信設定はユーザーの削除で消える）。
 */

test.describe.configure({ mode: "serial" });

let fixture: AuthFixture | undefined;
const eventIds: string[] = [];
let liveFixture: AuthFixture | undefined;
const liveSessionIds: string[] = [];

test.afterAll(async () => {
  if (fixture && eventIds.length > 0) {
    await fixture.admin.from("com_m_calendar_event").delete().in("calendar_event_id", eventIds);
  }
  await cleanupAuthFixture(fixture);
  if (liveFixture) {
    // コーチは固定アカウントのため、その送信待ち（送らなかった行）を消す。
    // セッションはチケットを直接参照しているため、契約・チケットの削除（cleanupAuthFixture）より先に消す
    for (const id of liveSessionIds) await liveFixture.admin.from("com_t_mail_outbox").delete().like("dedup_key", `${id}:%`);
    if (liveSessionIds.length > 0) await liveFixture.admin.from("com_t_session").delete().in("session_id", liveSessionIds);
  }
  await cleanupAuthFixture(liveFixture);
});

async function createEvent(f: AuthFixture, title: string, startOffsetMinutes: number, participantIds: string[]): Promise<string> {
  const start = new Date(Date.now() + startOffsetMinutes * 60 * 1000);
  const { data, error } = await f.admin
    .from("com_m_calendar_event")
    .insert({
      event_type: "GROUP_SESSION",
      title,
      start_datetime: start.toISOString(),
      end_datetime: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      location_url: `https://example.com/e2e-reminder/${f.tag}`,
      target_type: "CLIENT",
      client_id: f.clientId,
      rsvp_enabled: true,
      is_published: true,
    })
    .select("calendar_event_id")
    .single();
  if (error || !data) throw new Error(`イベントの作成に失敗: ${error?.message}`);
  const id = data.calendar_event_id as string;
  eventIds.push(id);
  const { error: pErr } = await f.admin
    .from("com_t_calendar_event_participant")
    .insert(participantIds.map((userId) => ({ calendar_event_id: id, user_id: userId })));
  if (pErr) throw new Error(`参加登録に失敗: ${pErr.message}`);
  return id;
}

async function outboxRows(f: AuthFixture, userId: string) {
  const { data, error } = await f.admin
    .from("com_t_mail_outbox")
    .select("dedup_key, status, last_error, provider_message_id")
    .eq("user_id", userId)
    .order("dedup_key");
  if (error) throw new Error(error.message);
  return data ?? [];
}

test("秘密のキーが無い呼び出しは拒否する", async () => {
  const response = await invokeMailDispatch(null);
  expect(response.status()).toBe(401);
});

test("1時間前・24時間前のリマインダーを送り、配信停止の人・ライセンスの無い人と期限外の予定には送らない", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "メール送信は desktop のみ");
  test.skip(!resendReadApiKey() || !cronSecret(), "RESEND_TEST_READ_API_KEY または CRON_SECRET が未設定");

  fixture = await createAuthFixture("mail");
  const password = getPersonaPassword();
  const emailA = resendTestAddress(`${fixture.tag}-remind`);
  const emailB = resendTestAddress(`${fixture.tag}-optout`);
  const studentA = await createDisposableStudent(fixture, { email: emailA, password, userName: "E2Eリマインド" });
  const studentB = await createDisposableStudent(fixture, { email: emailB, password });
  await grantAppLicense(fixture, studentA);
  await grantAppLicense(fixture, studentB);
  // C はライセンスが無い（契約の終了等）
  const studentC = await createDisposableStudent(fixture, { email: resendTestAddress(`${fixture.tag}-unlicensed`), password });
  // B はリマインダーのメールを停止している
  const { error: settingErr } = await fixture.admin
    .from("com_t_user_mail_setting")
    .insert({ user_id: studentB, category: "REMINDER", enabled: false });
  if (settingErr) throw new Error(settingErr.message);

  const soonTitle = `【E2E】リマインダー 1時間前 ${fixture.tag}`;
  const soonId = await createEvent(fixture, soonTitle, 50, [studentA, studentB, studentC]); // 1時間前の期限内
  const tomorrowId = await createEvent(fixture, `【E2E】リマインダー 24時間前 ${fixture.tag}`, 20 * 60, [studentB]); // 24時間前の期限内
  await createEvent(fixture, `【E2E】リマインダー 期限外 ${fixture.tag}`, 5 * 60, [studentA]); // 24時間前の期限（開始の12時間前まで）を過ぎ、1時間前はまだ

  const since = new Date();
  const response = await invokeMailDispatch();
  expect(response.status()).toBe(200);

  // A: 1時間前だけを送る（期限外の予定は登録しない）
  const rowsA = await outboxRows(fixture, studentA);
  expect(rowsA.map((r) => [r.dedup_key, r.status])).toEqual([[`${soonId}:1h`, "SENT"]]);
  expect(rowsA[0].provider_message_id).toBeTruthy();
  // B: 配信停止のため送らない（登録はされ、理由が残る）
  const rowsB = await outboxRows(fixture, studentB);
  expect(rowsB.map((r) => [r.dedup_key, r.status, r.last_error])).toEqual(
    [
      [`${soonId}:1h`, "SKIPPED", "opted_out"],
      [`${tomorrowId}:24h`, "SKIPPED", "opted_out"],
    ].sort((a, b) => a[0].localeCompare(b[0]))
  );
  // C: ライセンスが無いため送らない
  expect((await outboxRows(fixture, studentC)).map((r) => [r.dedup_key, r.status, r.last_error])).toEqual([
    [`${soonId}:1h`, "SKIPPED", "recipient_unlicensed"],
  ]);

  const mail = await waitForEmail({ to: emailA, since });
  expect(mail.subject).toMatch(/^【Gabby Blueprint】まもなくグループセッションが始まります/);
  expect(mail.html).toContain(soonTitle);
  expect(mail.html).toContain(`https://example.com/e2e-reminder/${fixture.tag}`);
  expect(mail.html).toContain("E2Eリマインド さん");

  // 再度呼んでも同じリマインダーは送らない
  const again = await invokeMailDispatch();
  expect(again.status()).toBe(200);
  expect(await outboxRows(fixture, studentA)).toHaveLength(1);
});

test("ライブセッションの1時間前のリマインダーを生徒・コーチに積み、生徒に届く。キャンセル済みの回には送らない", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "メール送信は desktop のみ");
  test.skip(!resendReadApiKey() || !cronSecret(), "RESEND_TEST_READ_API_KEY または CRON_SECRET が未設定");
  const DAY_MS = 24 * 60 * 60 * 1000;

  liveFixture = await createAuthFixture("mail");
  const f = liveFixture;
  const email = resendTestAddress(`${f.tag}-live`);
  const studentId = await createDisposableStudent(f, { email, password: getPersonaPassword(), userName: "E2Eライブ" });
  const { ticketId } = await grantLiveLicense(f, studentId, {
    planCode: "LIVE_WEEKLY1_3M",
    label: "live",
    start: new Date(Date.now() - DAY_MS),
    end: new Date(Date.now() + 30 * DAY_MS),
  });
  const { data: coach } = await f.admin.from("com_m_user").select("id, user_name").eq("user_name", "QAコーチUS01").single();
  const { data: schedule, error: scheduleError } = await f.admin
    .from("com_m_lesson_schedule")
    .insert({
      ticket_id: ticketId,
      student_id: studentId,
      coach_id: coach!.id,
      slot_no: 1,
      day_of_week: 0,
      start_time: "03:00",
      end_time: "03:25",
      schedule_timezone: "America/New_York",
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10),
      target_sessions: 12,
    })
    .select("schedule_id")
    .single();
  if (scheduleError || !schedule) throw new Error(`担当枠の作成に失敗: ${scheduleError?.message}`);

  // 50分後に始まる回（1時間前の期限内）と、キャンセル済みの回（55分後）
  const createSession = async (startOffsetMinutes: number, status: number) => {
    const start = new Date(Math.floor((Date.now() + startOffsetMinutes * 60 * 1000) / 60000) * 60000);
    const { data, error } = await f.admin
      .from("com_t_session")
      .insert({
        schedule_id: schedule.schedule_id,
        ticket_id: ticketId,
        student_id: studentId,
        coach_id: coach!.id,
        start_datetime: start.toISOString(),
        end_datetime: new Date(start.getTime() + 25 * 60 * 1000).toISOString(),
        status,
      })
      .select("session_id")
      .single();
    if (error || !data) throw new Error(`セッションの作成に失敗: ${error?.message}`);
    liveSessionIds.push(data.session_id as string);
    return data.session_id as string;
  };
  const sessionId = await createSession(50, 1);
  const cancelledId = await createSession(55, 3);

  const since = new Date();
  expect((await invokeMailDispatch()).status()).toBe(200);

  const rowsOf = async (userId: string) =>
    (await outboxRows(f, userId)).filter((r) => r.dedup_key.startsWith(sessionId) || r.dedup_key.startsWith(cancelledId));
  // 生徒: 予定の回の1時間前だけ（キャンセル済みの回は積まない）
  expect((await rowsOf(studentId)).map((r) => [r.dedup_key, r.status])).toEqual([[`${sessionId}:1h`, "SENT"]]);
  // コーチ: 組み立てまで進み、固定アカウント（予約済みドメイン）のため送らない
  const { data: coachRows } = await f.admin
    .from("com_t_mail_outbox")
    .select("dedup_key, status, last_error")
    .eq("user_id", coach!.id)
    .eq("dedup_key", `${sessionId}:1h`);
  expect(coachRows?.map((r) => [r.status, r.last_error])).toEqual([["SKIPPED", "undeliverable_address"]]);

  const mail = await waitForEmail({ to: email, since });
  expect(mail.subject).toMatch(/^【Gabby Blueprint】まもなくライブセッションが始まります/);
  expect(mail.html).toContain(coach!.user_name as string);
  // 通話画面は開始5分前まで入れないため、1時間前もライブセッション画面へ
  expect(mail.html).toContain("/live-room");
  expect(mail.html).not.toContain(`/live-room/${sessionId}`);
  expect(mail.html).toContain("ライブセッションを確認する");
});
