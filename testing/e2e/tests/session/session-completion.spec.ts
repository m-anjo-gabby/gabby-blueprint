import { expect, test, type Page } from "@playwright/test";
import { cleanupAuthFixture, createAuthFixture, deleteFixtureChatRooms, type AuthFixture } from "../../support/authFixtures.ts";
import { confirmModal, openCoachContext } from "../../support/coachApp.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
import {
  approveMatchingRequest,
  createPendingMatchingRequest,
  createStaleSessions,
  prepareLiveSessionDay,
  signOutLivePair,
  type LivePair,
} from "../../support/liveSessionFixtures.ts";

/**
 * ライブセッションの終了処理（機能: e2e/specs/session-lifecycle/session-completion.md）。
 * End Session の実施結果の分岐（早期終了・無断欠席）と、終了予定を過ぎたセッションの Resolve Manually（3つの結果）を確かめる。
 * 正常な実施完了はジャーニー（tests/journeys/coach-live-session.spec.ts）で確かめている。
 * 通話は入退室ログを直接入れて代替する（support/liveSessionFixtures.ts）。coach は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = "SessionDone2026a";

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

/** 担当成立済みの生徒・コーチを作る */
async function setUpPair(prefix: string): Promise<{ f: AuthFixture; p: LivePair; scheduleId: string }> {
  const f = await createAuthFixture(prefix);
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);
  return { f, p, scheduleId };
}

const hubPath = (p: LivePair, sessionId: string) => `/students/${p.studentId}/sessions/${sessionId}`;
const sessionInfo = (page: Page) => page.locator("section").filter({ has: page.getByText("Session Info", { exact: true }) }).first();

/** ハブで End Session を押して確認する */
async function endSession(page: Page): Promise<void> {
  const modal = confirmModal(page);
  await clickUntilVisible(sessionInfo(page).getByRole("button", { name: "End Session" }), modal);
  await modal.getByRole("button", { name: "End Session", exact: true }).click();
}

async function usedSessions(f: AuthFixture, p: LivePair): Promise<number | undefined> {
  const { data } = await f.admin.from("com_t_user_session_ticket").select("used_sessions").eq("ticket_id", p.ticketId).single();
  return data?.used_sessions;
}

test("通話の重なりが20分未満なら、理由を入力して早期終了として記録される（チケットは消化しない）", async ({ browser }) => {
  const { f, p, scheduleId } = await setUpPair("sessearly");
  const day = await prepareLiveSessionDay(f, p, scheduleId, { studentMinutesInCall: 10 });
  const reason = `Student had connectivity issues (${f.tag}).`;

  const { context, page } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await page.goto(hubPath(p, day.sessionId));
    await endSession(page);

    const reasonDialog = page.getByRole("dialog", { name: "Session ended early" });
    await expect(reasonDialog.getByRole("button", { name: "Submit" })).toBeDisabled();
    await reasonDialog.getByRole("textbox").fill(reason);
    await reasonDialog.getByRole("button", { name: "Submit" }).click();

    await expect(page).toHaveURL(new RegExp(`${hubPath(p, day.sessionId)}/result$`));
    await expect(page.getByText("Ended early", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(reason)).toBeVisible();

    const { data: session } = await f.admin.from("com_t_session").select("status, completion_result, status_note").eq("session_id", day.sessionId).single();
    expect(session).toMatchObject({ status: 2, completion_result: 2, status_note: reason });
    expect(await usedSessions(f, p)).toBe(0);
  } finally {
    await context.close();
  }
});

test("生徒が一度も入室していなければ、End Session で無断欠席として記録される（チケットは消化しない）", async ({ browser }) => {
  const { f, p, scheduleId } = await setUpPair("sessnoshow");
  const day = await prepareLiveSessionDay(f, p, scheduleId, { studentMinutesInCall: 0 });

  const { context, page } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await page.goto(hubPath(p, day.sessionId));
    await endSession(page);

    await expect(page).toHaveURL(new RegExp(`${hubPath(p, day.sessionId)}/result$`));
    await expect(page.getByText("No-show", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Session ended early" })).toHaveCount(0);

    const { data: session } = await f.admin.from("com_t_session").select("status, completion_result").eq("session_id", day.sessionId).single();
    expect(session).toMatchObject({ status: 2, completion_result: 3 });
    expect(await usedSessions(f, p)).toBe(0);
  } finally {
    await context.close();
  }
});

test("終了予定を過ぎたセッションは Resolve Manually で、実施完了・無断欠席・コーチの欠席（キャンセル・返還）に確定できる", async ({ browser }) => {
  test.setTimeout(150_000);
  const { f, p, scheduleId } = await setUpPair("sessresolve");
  const [completedId, noShowId, missedId] = await createStaleSessions(f, p, scheduleId, 3);

  const { context, page } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    /** ハブを開き、Resolve Manually のダイアログで結果と理由を選んで確定する */
    const resolve = async (sessionId: string, outcome: string, reason: string) => {
      await page.goto(hubPath(p, sessionId));
      await expect(sessionInfo(page)).toContainText("This session’s scheduled end time has passed");
      await expect(sessionInfo(page).getByRole("button", { name: "End Session" })).toBeDisabled();
      const dialog = page.getByRole("dialog", { name: "Resolve Session" });
      await clickUntilVisible(sessionInfo(page).getByRole("button", { name: "Resolve Manually" }), dialog);
      await dialog.getByRole("combobox").selectOption({ label: outcome });
      await expect(dialog.getByRole("button", { name: "Resolve" })).toBeDisabled();
      await dialog.getByRole("textbox").fill(reason);
      await dialog.getByRole("button", { name: "Resolve" }).click();
    };

    await test.step("実施完了（アプリ外で実施）: 結果画面へ移り、チケットを1回消化する", async () => {
      const reason = `Conducted over a direct Zoom call (${f.tag}).`;
      await resolve(completedId, "Completed (conducted outside the app)", reason);
      await expect(page).toHaveURL(new RegExp(`${hubPath(p, completedId)}/result$`));
      await expect(page.getByText(reason)).toBeVisible();
      const { data } = await f.admin.from("com_t_session").select("status, completion_result, status_note").eq("session_id", completedId).single();
      expect(data).toMatchObject({ status: 2, completion_result: 1, status_note: reason });
      expect(await usedSessions(f, p)).toBe(1);
    });

    await test.step("無断欠席: 結果画面へ移り、チケットは消化しない", async () => {
      await resolve(noShowId, "No-show (the student never showed up)", `The student never showed up (${f.tag}).`);
      await expect(page).toHaveURL(new RegExp(`${hubPath(p, noShowId)}/result$`));
      await expect(page.getByText("No-show", { exact: true }).first()).toBeVisible();
      const { data } = await f.admin.from("com_t_session").select("status, completion_result").eq("session_id", noShowId).single();
      expect(data).toMatchObject({ status: 2, completion_result: 3 });
      expect(await usedSessions(f, p)).toBe(1);
    });

    await test.step("コーチの欠席: キャンセル（チケット返還）になり、生徒概要へ戻り、生徒へ通知する", async () => {
      await resolve(missedId, "I missed this session (cancels it — the student's ticket is refunded)", `I was sick and missed the session (${f.tag}).`);
      await expect(page).toHaveURL(new RegExp(`/students/${p.studentId}$`));
      const { data } = await f.admin
        .from("com_t_session").select("status, cancel_category, ticket_refunded").eq("session_id", missedId).single();
      expect(data).toMatchObject({ status: 3, cancel_category: 2, ticket_refunded: true });
      expect(await usedSessions(f, p)).toBe(1);
      const { count } = await f.admin
        .from("com_t_notification").select("*", { count: "exact", head: true })
        .eq("user_id", p.studentId).eq("notification_type", "SESSION_CANCELLED_BY_COACH");
      expect(count).toBe(1);
    });
  } finally {
    await context.close();
  }
});
