import { expect, test, type Page } from "@playwright/test";
import { cleanupAuthFixture, createAuthFixture, deleteFixtureChatRooms, type AuthFixture } from "../../support/authFixtures.ts";
import { confirmModal, openCoachContext } from "../../support/coachApp.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
import { createPendingMatchingRequest, signOutLivePair, type LivePair } from "../../support/liveSessionFixtures.ts";

/**
 * コーチの申請一覧で専属コーチの申請を承認・否認する（画面: docs/screens/coach/matching-requests.md、
 * 機能: e2e/specs/matching/coach-matching.md 4a・4b・異常系 #10）。
 * 使い捨ての生徒（日本時間）とコーチ（日本時間）を作り、生徒の申請（金曜 20:00〜20:25）は本人のログインで登録する
 * （support/liveSessionFixtures.ts。生徒の画面からの申請は matching/ のテストで確認済み）。コーチは画面にログインして操作する。
 */

const PASSWORD = "CoachReqPass2026a";

let fixture: AuthFixture | undefined;
let pair: LivePair | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、coach は PC 表示の別コンテキストで開くため desktop だけで実行する");
});

test.afterEach(async () => {
  await signOutLivePair(pair);
  pair = undefined;
  // 承認時に生徒×コーチの1対1のチャットルームが作られる
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** 使い捨ての生徒・コーチと、承認待ちの申請を1件作る */
async function createPendingRequest(prefix: string): Promise<LivePair> {
  fixture = await createAuthFixture(prefix);
  pair = await createPendingMatchingRequest(fixture, PASSWORD);
  return pair;
}

async function openRequests(page: Page): Promise<void> {
  await page.goto("/matching-requests");
  await expect(page.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible();
}

const pendingSection = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: /^Pending \(\d+\)$/ }) });
const historySection = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: "History" }) });

test("承認すると申請が承認済みになり、契約期間分のセッションが作られる", async ({ browser }) => {
  const req = await createPendingRequest("coachappr");
  const { context, page } = await openCoachContext(browser, { email: req.coachEmail, password: PASSWORD });
  try {
    await openRequests(page);
    await expect(pendingSection(page).getByRole("heading", { name: "Pending (1)" })).toBeVisible();
    const card = pendingSection(page).locator("article").filter({ hasText: req.studentName });
    // コーチと生徒が同じタイムゾーンのため、生徒側の時刻の併記は出ない
    await expect(card).toContainText("Slot 1 · Friday 20:00 - 20:25");
    await expect(card).not.toContainText("Student's time");
    await expect(card).toContainText("Pending");

    const modal = confirmModal(page);
    await clickUntilVisible(card.getByRole("button", { name: "Approve" }), modal);
    await expect(modal).toContainText("Approve this request?");
    await modal.getByRole("button", { name: "Approve", exact: true }).click();

    await expect(page.getByText("Request approved. Sessions have been booked.")).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect(pendingSection(page).getByText("No pending requests.")).toBeVisible();

    const { data: request } = await fixture!.admin
      .from("com_t_matching_request").select("status").eq("request_id", req.requestId).single();
    expect(request?.status).toBe(2);
    const { data: schedule } = await fixture!.admin
      .from("com_m_lesson_schedule").select("schedule_id, day_of_week, start_time, schedule_timezone").eq("ticket_id", req.ticketId).single();
    expect(schedule).toMatchObject({ day_of_week: 5, start_time: "20:00:00", schedule_timezone: "Asia/Tokyo" });
    const { count } = await fixture!.admin
      .from("com_t_session").select("session_id", { count: "exact", head: true }).eq("schedule_id", schedule!.schedule_id);
    expect(count ?? 0).toBeGreaterThan(0);

    // 開き直すと履歴（Matching Requests）に承認済みとして出る
    await openRequests(page);
    const historyCard = historySection(page).locator("article").filter({ hasText: req.studentName });
    await expect(historyCard).toContainText("Approved");
    await expect(historyCard.getByRole("button", { name: "Approve" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("否認は理由が必須で、入力した理由とともに否認済みになる", async ({ browser }) => {
  const req = await createPendingRequest("coachrej");
  const reason = "This time slot is no longer available. Please choose another time.";
  const { context, page } = await openCoachContext(browser, { email: req.coachEmail, password: PASSWORD });
  try {
    await openRequests(page);
    const card = pendingSection(page).locator("article").filter({ hasText: req.studentName });
    const dialog = page.getByRole("dialog", { name: "Reject Request" });
    await clickUntilVisible(card.getByRole("button", { name: "Reject" }), dialog);
    await expect(dialog).toContainText(`Let ${req.studentName} know why this slot doesn't work.`);
    // 理由が空のままでは否認できない（異常系 #10）
    await dialog.getByRole("button", { name: "Reject Request" }).click();
    await expect(page.getByText("Please enter a reason for rejecting this request.")).toBeVisible();
    await expect(dialog).toBeVisible();

    await dialog.getByRole("textbox").fill(reason);
    await dialog.getByRole("button", { name: "Reject Request" }).click();
    await expect(page.getByText("Request rejected.")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(card).toHaveCount(0);

    const { data: request } = await fixture!.admin
      .from("com_t_matching_request").select("status, reject_reason").eq("request_id", req.requestId).single();
    expect(request).toMatchObject({ status: 3, reject_reason: reason });
    const { count } = await fixture!.admin
      .from("com_m_lesson_schedule").select("schedule_id", { count: "exact", head: true }).eq("ticket_id", req.ticketId);
    expect(count).toBe(0);

    // 開き直すと履歴に否認済みとして理由つきで出る
    await openRequests(page);
    const historyCard = historySection(page).locator("article").filter({ hasText: req.studentName });
    await expect(historyCard).toContainText("Rejected");
    await expect(historyCard).toContainText(reason);
  } finally {
    await context.close();
  }
});
