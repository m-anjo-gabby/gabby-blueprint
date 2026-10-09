import type { Page } from "@playwright/test";
import { formatDateTimeEn } from "@gabby/lib/date/dateEn";
import { signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { cleanupAuthFixture, createAuthFixture, deleteFixtureChatRooms, type AuthFixture } from "../../support/authFixtures.ts";
import { confirmModal, openCoachContext } from "../../support/coachApp.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
import {
  fillSlot,
  jstDateOf,
  jstSlot,
  jstSlotOn,
  liveRoomBreakdown,
  nextSessionSection,
  openLiveRoom,
  studentSlotText,
  type JstSlot,
} from "../../support/liveRoomView.ts";
import {
  approveMatchingRequest,
  createPendingMatchingRequest,
  signOutLivePair,
  type LivePair,
} from "../../support/liveSessionFixtures.ts";
import { expect, loginAsNewStudent, test } from "../../support/studentApp.ts";

/**
 * ライブセッションの日程変更の分岐（仕様書: e2e/specs/booking/individual-booking-and-reschedule.md）
 *
 * 正常系の一連はジャーニー（tests/journeys/live-session-reschedule.spec.ts）で確認済み。ここではその分岐を1件ずつ確かめる。
 * - 予約リクエスト: 送る前の知らせ（24時間以内・予定の重なり）、取り下げ、コーチの却下（理由は通知メールに載る）
 * - 振替候補: コーチの候補を生徒が承諾（残りは不採用）、生徒の候補をコーチがまとめて見送る（通知なし）
 * - 開始12時間を切った回の生徒のキャンセル（返還なし・候補は出せない）
 *
 * 各テストで使い捨ての生徒（週1回・12回のライブ付き契約）とコーチを担当成立させる（毎週金曜 20:00〜20:25、日本時間。
 * support/liveSessionFixtures.ts）。分岐の前段（キャンセル・候補の提案）は本人のログインで RPC を呼んで作る。
 * coach は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = "LiveBranches2026a";
const HOUR_MS = 60 * 60 * 1000;
const LESSON_MS = 25 * 60 * 1000;

interface Booked {
  f: AuthFixture;
  p: LivePair;
  total: number;
  sessions: { session_id: string; start_datetime: string; end_datetime: string }[];
}

let fixture: AuthFixture | undefined;
let pair: LivePair | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、coach は PC 表示の別コンテキストで開くため desktop だけで実行する");
});

test.afterEach(async () => {
  await signOutLivePair(pair);
  pair = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** 担当を成立させ、契約期間分（12回）の毎週の予定を入れる */
async function setupBooked(prefix: string): Promise<Booked> {
  const f = await createAuthFixture(prefix);
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);
  const { data: sessions } = await f.admin
    .from("com_t_session").select("session_id, start_datetime, end_datetime").eq("schedule_id", scheduleId).eq("status", 1).order("start_datetime");
  return { f, p, total: sessions!.length, sessions: sessions! };
}

/** 本人（生徒・コーチ）のログインで、回をキャンセルして振替候補を出す（開始12時間以上前のため返還される） */
async function cancelWithProposals(email: string, sessionId: string, slots: JstSlot[]): Promise<void> {
  const client = await signInAsRole(email, PASSWORD);
  try {
    const { error } = await client.rpc("cancel_session", {
      p_session_id: sessionId,
      p_proposed_slots: slots.length > 0 ? slots.map((s) => ({ start_datetime: s.startIso, end_datetime: s.endIso })) : null,
    });
    if (error) throw new Error(`キャンセルに失敗しました: ${error.message}`);
  } finally {
    await signOutRole(client);
  }
}

/** キャンセルで出した振替候補の状態（候補の日時順。1=回答待ち・2=承諾・3=不採用） */
async function proposalStatuses(f: AuthFixture, sourceSessionId: string): Promise<number[]> {
  const { data } = await f.admin
    .from("com_t_session_slot_proposal").select("status").eq("source_session_id", sourceSessionId).order("proposed_start_datetime");
  return (data ?? []).map((r) => r.status as number);
}

/** 日本時間で今から3時間後（30分単位に切り捨て）。開始24時間以内の日時として使う */
function soonSlot(): JstSlot {
  const at = new Date(Math.floor((Date.now() + 3 * HOUR_MS) / (30 * 60 * 1000)) * 30 * 60 * 1000).toISOString();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(at));
  return jstSlotOn(jstDateOf(at), time);
}

/** 「日時をリクエスト」から予約リクエストのダイアログを開く */
async function openBookingDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "セッションを予約" });
  await expect(page.getByText("日時が決まっていないセッションが1回あります")).toBeVisible();
  await clickUntilVisible(page.getByRole("button", { name: "日時をリクエスト" }), dialog);
  return dialog;
}

test("予約リクエストは送る前に24時間以内・予定の重なりを知らせ、取り下げ・コーチの却下で未予約に戻る", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const { f, p, total, sessions } = await setupBooked("bookingreject");
  // 生徒が2回目をキャンセル（返還あり・候補なし）して、未予約を1回つくる
  await cancelWithProposals(p.studentEmail, sessions[1].session_id, []);
  const requestA = jstSlot(3, "10:00");
  const requestB = jstSlot(4, "10:00");
  const rejectReason = `I'm away that morning. Please pick another day. (${f.tag})`;

  await loginAsNewStudent(page, p.studentEmail, PASSWORD);

  await test.step("生徒: 24時間以内・毎週の予定と重なる日時は、送る前に知らせて送れない", async () => {
    await openLiveRoom(page);
    await expect(liveRoomBreakdown(page, { scheduled: total - 1, unbooked: 1 })).toBeVisible();
    const dialog = await openBookingDialog(page);
    const submit = dialog.getByRole("button", { name: "リクエストする" });

    await fillSlot(dialog, 0, soonSlot());
    await expect(dialog).toContainText("開始24時間以内の予約はできません。翌日以降の日時を選択してください。");
    await expect(submit).toBeDisabled();

    const weekly = sessions[2];
    await fillSlot(dialog, 0, jstSlotOn(jstDateOf(weekly.start_datetime), "20:00"));
    await expect(dialog).toContainText("コーチが同じ時間帯に別のセッションの予定があります。");
    await expect(submit).toBeDisabled();

    await fillSlot(dialog, 0, requestA);
    await submit.click();
    await expect(page.getByText("予約をリクエストしました。コーチの承認をお待ちください。")).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  await test.step("生徒: 承認待ちのリクエストを取り下げると、未予約に戻る", async () => {
    const request = page.getByRole("listitem").filter({ hasText: "承認待ち" });
    await expect(request).toContainText(studentSlotText(requestA.startIso, requestA.endIso));
    await expect(liveRoomBreakdown(page, { scheduled: total - 1, adjusting: 1 })).toBeVisible();
    await request.getByRole("button", { name: "取り下げる" }).click();
    await expect(page.getByText("予約リクエストを取り下げました。")).toBeVisible();
    await expect(request).toHaveCount(0);
    await expect(liveRoomBreakdown(page, { scheduled: total - 1, unbooked: 1 })).toBeVisible();

    const { data } = await f.admin
      .from("com_t_session_slot_proposal").select("status").eq("student_id", p.studentId).is("source_session_id", null);
    expect(data?.map((r) => r.status)).toEqual([4]);

    // 別の日時でリクエストし直す（次の手順でコーチが却下する）
    const dialog = await openBookingDialog(page);
    await fillSlot(dialog, 0, requestB);
    await dialog.getByRole("button", { name: "リクエストする" }).click();
    await expect(page.getByText("予約をリクエストしました。コーチの承認をお待ちください。")).toBeVisible();
  });

  const { context: coachContext, page: coach } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await test.step("コーチ: 取り下げたリクエストは出ず、残りのリクエストを理由つきで却下する", async () => {
      await coach.goto("/calendar");
      const cards = coach.locator("article").filter({ hasText: "New Booking" }).filter({ hasText: p.studentName });
      await expect(cards).toHaveCount(1);
      await expect(cards).toContainText(formatDateTimeEn(requestB.startIso, "Asia/Tokyo"));
      const dialog = coach.getByRole("dialog", { name: "Reject Booking Request" });
      await clickUntilVisible(cards.getByRole("button", { name: "Reject" }), dialog);
      await dialog.getByRole("textbox").fill(rejectReason);
      await dialog.getByRole("button", { name: "Reject Request" }).click();
      await expect(coach.getByText("Request rejected.")).toBeVisible();
      await expect(cards.getByRole("button", { name: "Approve" })).toHaveCount(0);
    });
  } finally {
    await coachContext.close();
  }

  await test.step("生徒: 却下で未予約に戻り、通知が届く（理由は通知メールに載る）", async () => {
    await openLiveRoom(page);
    await expect(page.getByRole("listitem").filter({ hasText: "承認待ち" })).toHaveCount(0);
    await expect(liveRoomBreakdown(page, { scheduled: total - 1, unbooked: 1 })).toBeVisible();
    await expect(page.getByText("日時が決まっていないセッションが1回あります")).toBeVisible();

    await page.goto("/notification");
    await expect(page.getByRole("main")).toContainText("予約リクエストについて");

    const { data: notification } = await f.admin
      .from("com_t_notification").select("notification_id, payload").eq("user_id", p.studentId).eq("notification_type", "SESSION_BOOKING_REJECTED").single();
    expect(notification!.payload).toMatchObject({ reject_reason: rejectReason });
    const { count } = await f.admin
      .from("com_t_mail_outbox").select("user_id", { count: "exact", head: true }).eq("user_id", p.studentId).eq("dedup_key", notification!.notification_id);
    expect(count).toBe(1);
  });
});

test("コーチのキャンセルで届いた振替候補を生徒が承諾すると、その日時で予約され、残りの候補は不採用になる", async ({ page }) => {
  test.setTimeout(180_000);
  const { f, p, total, sessions } = await setupBooked("proposalaccept");
  const candidates = [jstSlot(3, "10:00"), jstSlot(4, "10:00")];
  await cancelWithProposals(p.coachEmail, sessions[1].session_id, candidates);

  await loginAsNewStudent(page, p.studentEmail, PASSWORD);
  await openLiveRoom(page);
  await expect(liveRoomBreakdown(page, { scheduled: total - 1, adjusting: 1 })).toBeVisible();
  const card = page.locator("section").filter({ hasText: `${p.coachName}コーチの都合でキャンセルになりました` });
  await expect(card.getByRole("radio")).toHaveText(candidates.map((c) => studentSlotText(c.startIso, c.endIso)));

  await card.getByRole("radio").nth(1).click();
  await card.getByRole("button", { name: "この日時で予約する" }).click();
  await expect(page.getByText("振替のセッションを予約しました。")).toBeVisible();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText(studentSlotText(candidates[1].startIso, candidates[1].endIso));
  await expect(liveRoomBreakdown(page, { scheduled: total })).toBeVisible();
  expect(await proposalStatuses(f, sessions[1].session_id)).toEqual([3, 2]);
});

test("生徒が出した振替候補をコーチがまとめて見送ると、生徒の未予約に戻り、生徒へは通知しない", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { f, p, total, sessions } = await setupBooked("proposaldecline");
  const candidates = [jstSlot(3, "10:00"), jstSlot(4, "10:00")];
  await cancelWithProposals(p.studentEmail, sessions[1].session_id, candidates);
  const declinedAt = new Date().toISOString();

  const { context: coachContext, page: coach } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await coach.goto("/calendar");
    const card = coach.locator("article").filter({ hasText: "Reschedule Proposal" }).filter({ hasText: p.studentName });
    const modal = confirmModal(coach);
    await clickUntilVisible(card.getByRole("button", { name: "Decline all" }), modal);
    await modal.getByRole("button", { name: "Decline all" }).click();
    await expect(coach.getByText("Declined the proposed times.")).toBeVisible();
    await expect(card.getByRole("button", { name: "Book selected time" })).toHaveCount(0);
  } finally {
    await coachContext.close();
  }
  expect(await proposalStatuses(f, sessions[1].session_id)).toEqual([3, 3]);

  await loginAsNewStudent(page, p.studentEmail, PASSWORD);
  await openLiveRoom(page);
  await expect(page.getByText("振替の候補・回答待ち")).toHaveCount(0);
  await expect(liveRoomBreakdown(page, { scheduled: total - 1, unbooked: 1 })).toBeVisible();
  await expect(page.getByText("日時が決まっていないセッションが1回あります")).toBeVisible();
  const { data: notifications } = await f.admin
    .from("com_t_notification").select("notification_type").eq("user_id", p.studentId).gte("insert_date", declinedAt);
  expect(notifications).toEqual([]);
});

test("開始12時間を切った回を生徒がキャンセルすると返還されず、振替候補も出せない", async ({ page }) => {
  test.setTimeout(180_000);
  const { f, p, total, sessions } = await setupBooked("latecancel");
  // 1回目を6時間後に移す（次回のセッションになる）
  const soonStart = Math.floor((Date.now() + 6 * HOUR_MS) / 60_000) * 60_000;
  const late = { ...sessions[0], start_datetime: new Date(soonStart).toISOString(), end_datetime: new Date(soonStart + LESSON_MS).toISOString() };
  const { error } = await f.admin
    .from("com_t_session").update({ start_datetime: late.start_datetime, end_datetime: late.end_datetime }).eq("session_id", late.session_id);
  if (error) throw new Error(`回の移動に失敗しました: ${error.message}`);

  await loginAsNewStudent(page, p.studentEmail, PASSWORD);
  await openLiveRoom(page);
  await expect(nextSessionSection(page)).toContainText(studentSlotText(late.start_datetime, late.end_datetime));

  const dialog = page.getByRole("dialog", { name: "セッションをキャンセル" });
  await clickUntilVisible(page.getByRole("button", { name: "この回をキャンセル" }), dialog);
  await expect(dialog).toContainText("開始12時間を切っているため、この回の予約枠は返還されません（再予約できません）。");
  await expect(dialog.getByRole("button", { name: "候補を追加" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "キャンセルする" }).click();
  await expect(page.getByText("セッションをキャンセルしました", { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);

  // 直前キャンセルは消化済み扱い（未予約に戻らず、予約リクエストの案内も出ない）
  await expect(liveRoomBreakdown(page, { lateCancelled: 1, scheduled: total - 1 })).toBeVisible();
  await expect(page.getByText(/日時が決まっていないセッションが/)).toHaveCount(0);
  const { data: cancelled } = await f.admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("session_id", late.session_id).single();
  expect(cancelled).toMatchObject({ status: 3, cancel_category: 1, ticket_refunded: false });
});

