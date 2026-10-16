import type { Page } from "@playwright/test";
import { expect, loginAsNewStudent, test } from "../../support/studentApp.ts";
import { cleanupAuthFixture, createAuthFixture, deleteFixtureChatRooms, type AuthFixture } from "../../support/authFixtures.ts";
import { openCoachContext } from "../../support/coachApp.ts";
import {
  approveMatchingRequest,
  createCompletedSessionWithHomework,
  createPendingMatchingRequest,
  signOutLivePair,
  type LivePair,
} from "../../support/liveSessionFixtures.ts";

/**
 * ライブセッションの宿題（機能: e2e/specs/homework/session-homework.md 手順2〜6）。
 * - 手順2〜3: 生徒が通知のリンクから宿題を開くと、コーチの結果画面・次回のハブに「生徒が見た」ことが出る
 * - 手順4: コーチの追記のコメントが生徒の画面に出て、宿題の通知（1セッション1件）が未読に戻る。生徒が開くまで「最新の追記を見ていない」と出る
 * - 手順5: 結果画面で投稿した宿題が、次回のセッションのハブの Last Homework に出る（投稿したセッション自身のハブには出ない）
 * - 手順6: Session Tasks の「Homework not posted」に、生徒の欠席の回と「今回は宿題なし」にした回は出ない
 * 宿題の投稿の画面操作はジャーニー（tests/journeys/coach-live-session.spec.ts）で確かめているため、ここでは宿題を直接作る
 * （登録時のトリガーで生徒への通知が作られる）。使い捨てデータを作るため desktop だけで実行する。
 */

const PASSWORD = "Homework2026a";
const DAY_MS = 24 * 60 * 60 * 1000;

test.use({ storageState: { cookies: [], origins: [] } });

let fixture: AuthFixture | undefined;
let pair: LivePair | undefined;

test.afterEach(async () => {
  await signOutLivePair(pair);
  pair = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

async function setUpPair(prefix: string): Promise<{ f: AuthFixture; p: LivePair; scheduleId: string }> {
  const f = await createAuthFixture(prefix);
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);
  return { f, p, scheduleId };
}

const viewedStatus = (page: Page) => page.getByTestId("homework-viewed-status");

test("生徒が通知から宿題を開くと、コーチの結果画面と次回のハブに「生徒が見た」ことが出る", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  test.setTimeout(180_000);
  const { f, p, scheduleId } = await setUpPair("homework");
  const homework = await createCompletedSessionWithHomework(f, p, scheduleId, { daysAgo: 1 });
  const { data: next } = await f.admin
    .from("com_t_session").select("session_id")
    .eq("ticket_id", p.ticketId).eq("status", 1).gt("start_datetime", new Date().toISOString())
    .order("start_datetime").limit(1).single();
  if (!next) throw new Error("次回のセッションが見つかりません");

  // 生徒への通知（リンク先は生徒のセッション結果画面）
  const { data: notification } = await f.admin
    .from("com_t_notification").select("link_path, is_read")
    .eq("user_id", p.studentId).eq("notification_type", "HOMEWORK_POSTED").single();
  expect(notification).toMatchObject({ link_path: `/live-room/sessions/${homework.sessionId}/result`, is_read: false });

  const { context, page: coachPage } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await test.step("コーチ: 生徒が開く前は「まだ見ていない」", async () => {
      await coachPage.goto(`/students/${p.studentId}/sessions/${homework.sessionId}/result`);
      await expect(coachPage.getByText(homework.homeworkText)).toBeVisible();
      await expect(viewedStatus(coachPage)).toHaveText("Not viewed by the student yet");
    });

    await test.step("生徒: 通知のリンクから宿題を開く（チェックリストは無い）", async () => {
      await loginAsNewStudent(page, p.studentEmail, PASSWORD);
      await page.goto(notification!.link_path);
      const main = page.getByRole("main");
      await expect(main.getByText(homework.homeworkText)).toBeVisible();
      await expect(main.getByText("チェックリスト")).toHaveCount(0);
      const { data } = await f.admin.from("com_t_session_homework").select("student_viewed_at").eq("session_id", homework.sessionId).single();
      expect(data?.student_viewed_at).not.toBeNull();
    });

    await test.step("コーチ: 結果画面と次回のハブの Last Homework に「生徒が見た」と出る", async () => {
      await coachPage.goto(`/students/${p.studentId}/sessions/${homework.sessionId}/result`);
      await expect(viewedStatus(coachPage)).toContainText("Viewed by the student");
      await coachPage.goto(`/students/${p.studentId}/sessions/${next.session_id}`);
      await expect(viewedStatus(coachPage)).toContainText("Viewed by the student");
    });
  } finally {
    await context.close();
  }
});

test("コーチが追記のコメントを送ると、生徒の画面に出て、宿題の通知が未読に戻り、生徒が開くまで「最新の追記を見ていない」と出る", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  test.setTimeout(180_000);
  const { f, p, scheduleId } = await setUpPair("hwcomment");
  const homework = await createCompletedSessionWithHomework(f, p, scheduleId, { daysAgo: 1 });
  const comment = `Please also add one sentence about your weekend (${f.tag}).`;

  const homeworkNotifications = async () => {
    const { data } = await f.admin
      .from("com_t_notification").select("is_read, occurred_at, dedup_key")
      .eq("user_id", p.studentId).eq("notification_type", "HOMEWORK_POSTED");
    return data ?? [];
  };
  // 生徒が宿題を開いて通知を既読にした状態から始める
  const viewedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { error: viewedError } = await f.admin.from("com_t_session_homework").update({ student_viewed_at: viewedAt }).eq("session_id", homework.sessionId);
  if (viewedError) throw new Error(`閲覧日時の設定に失敗しました: ${viewedError.message}`);
  const { error: readError } = await f.admin
    .from("com_t_notification").update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", p.studentId).eq("notification_type", "HOMEWORK_POSTED");
  if (readError) throw new Error(`通知の既読化に失敗しました: ${readError.message}`);
  const [before] = await homeworkNotifications();
  expect(before.is_read).toBe(true);

  const { context, page: coachPage } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await test.step("コーチ: 結果画面から追記のコメントを送ると「最新の追記を見ていない」と出る", async () => {
      await coachPage.goto(`/students/${p.studentId}/sessions/${homework.sessionId}/result`);
      await expect(coachPage.getByText(homework.homeworkText)).toBeVisible();
      await expect(viewedStatus(coachPage)).toContainText("Viewed by the student");
      const send = coachPage.getByRole("button", { name: "Send comment" });
      await expect(send).toBeDisabled();
      await coachPage.getByPlaceholder(/^Send a follow-up comment about this homework/).fill(comment);
      await send.click();
      await expect(coachPage.getByText(comment)).toBeVisible();
      await expect(viewedStatus(coachPage)).toContainText("your latest comment isn’t viewed yet");
    });

    await test.step("通知は同じ1件が未読に戻り、日時が新しくなる", async () => {
      await expect.poll(async () => (await homeworkNotifications()).map((n) => n.is_read)).toEqual([false]);
      const [after] = await homeworkNotifications();
      expect(after.dedup_key).toBe(homework.sessionId);
      expect(new Date(after.occurred_at).getTime()).toBeGreaterThan(new Date(before.occurred_at).getTime());
    });

    await test.step("生徒: セッション結果画面のフォローアップコメントに出る。開いた後はコーチの画面の印が消える", async () => {
      await loginAsNewStudent(page, p.studentEmail, PASSWORD);
      await page.goto(`/live-room/sessions/${homework.sessionId}/result`);
      const main = page.getByRole("main");
      await expect(main.getByText(homework.homeworkText)).toBeVisible();
      await expect(main.getByText(comment)).toBeVisible();
      await expect(main.getByText("フォローアップコメントはまだありません。")).toHaveCount(0);

      await coachPage.reload();
      await expect(viewedStatus(coachPage)).toContainText("Viewed by the student");
      await expect(viewedStatus(coachPage)).not.toContainText("latest comment");
    });
  } finally {
    await context.close();
  }
});

test("結果画面で投稿した宿題が次回のセッションのハブの Last Homework に出て、投稿したセッション自身のハブには出ない", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  test.setTimeout(180_000);
  const { f, p, scheduleId } = await setUpPair("hwlast");

  // 前回（昨日）の実施済みのセッション（宿題なし）と、承認で作られた次回の予定のセッション
  const start = Date.now() - DAY_MS;
  const { data: done, error: doneError } = await f.admin
    .from("com_t_session")
    .insert({
      schedule_id: scheduleId, ticket_id: p.ticketId, student_id: p.studentId, coach_id: p.coachId,
      start_datetime: new Date(start).toISOString(), end_datetime: new Date(start + 25 * 60 * 1000).toISOString(),
      status: 2, completion_result: 1,
    })
    .select("session_id")
    .single();
  if (doneError || !done) throw new Error(`実施済みのセッションの作成に失敗しました: ${doneError?.message}`);
  const { data: next, error: nextError } = await f.admin
    .from("com_t_session").select("session_id")
    .eq("ticket_id", p.ticketId).eq("status", 1).gt("start_datetime", new Date().toISOString())
    .order("start_datetime").limit(1).single();
  if (nextError || !next) throw new Error(`次回のセッションが見つかりません: ${nextError?.message}`);

  const instructions = `Read the article and summarize it in three lines (${f.tag}).`;
  /** ハブの Last Homework のカード（見出しから最も近いカードの枠） */
  const lastHomework = (coachPage: Page) =>
    coachPage.getByText("Last Homework", { exact: true }).locator("xpath=ancestor::*[contains(@class, 'rounded-2xl')][1]");

  const { context, page: coachPage } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await test.step("結果画面で宿題を投稿する", async () => {
      await coachPage.goto(`/students/${p.studentId}/sessions/${done.session_id}/result`);
      await coachPage.getByPlaceholder("Instructions for the student (required)...").fill(instructions);
      await coachPage.getByRole("button", { name: "Post Homework" }).click();
      await expect(coachPage.getByText(instructions)).toBeVisible();
      await expect(coachPage.getByRole("button", { name: "Post Homework" })).toHaveCount(0);
    });

    await test.step("次回のセッションのハブの Last Homework に出る（生徒はまだ見ていない）", async () => {
      await coachPage.goto(`/students/${p.studentId}/sessions/${next.session_id}`);
      await expect(lastHomework(coachPage).getByText(instructions)).toBeVisible();
      await expect(lastHomework(coachPage).getByText("Not viewed by the student yet")).toBeVisible();
    });

    await test.step("投稿したセッション自身のハブには出ない", async () => {
      await coachPage.goto(`/students/${p.studentId}/sessions/${done.session_id}`);
      await expect(lastHomework(coachPage).getByText("No homework posted yet.")).toBeVisible();
      await expect(coachPage.getByText(instructions)).toHaveCount(0);
    });
  } finally {
    await context.close();
  }
});

test("Session Tasks の「Homework not posted」に、生徒の欠席の回と「今回は宿題なし」にした回は出ない", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  test.setTimeout(180_000);
  const { f, p, scheduleId } = await setUpPair("hwskip");

  // 実施済みで宿題の無い回を2つ（1日前: 実施完了、2日前: 生徒の欠席）
  const rows = [
    { daysAgo: 1, completion_result: 1 },
    { daysAgo: 2, completion_result: 3 },
  ].map(({ daysAgo, completion_result }) => {
    const start = Date.now() - daysAgo * DAY_MS;
    return {
      schedule_id: scheduleId, ticket_id: p.ticketId, student_id: p.studentId, coach_id: p.coachId,
      start_datetime: new Date(start).toISOString(), end_datetime: new Date(start + 25 * 60 * 1000).toISOString(),
      status: 2, completion_result,
    };
  });
  const { data: sessions, error } = await f.admin.from("com_t_session").insert(rows).select("session_id, completion_result");
  if (error || !sessions) throw new Error(`実施済みのセッションの作成に失敗しました: ${error?.message}`);
  const completedId = sessions.find((s) => s.completion_result === 1)!.session_id;

  const { context, page: coachPage } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  const homeworkTasks = () => coachPage.getByText(`${p.studentName} — Homework not posted`);
  try {
    await test.step("ダッシュボード: 欠席の回は出ず、実施完了の回だけが出る", async () => {
      await coachPage.goto("/dashboard");
      await expect(homeworkTasks()).toHaveCount(1);
    });

    await test.step("結果画面で「今回は宿題なし」にすると、ダッシュボードから消える", async () => {
      await coachPage.goto(`/students/${p.studentId}/sessions/${completedId}/result`);
      await coachPage.getByRole("button", { name: "No homework this time" }).click();
      await expect(coachPage.getByText("No homework for this session.")).toBeVisible();
      const { data } = await f.admin.from("com_t_session").select("homework_not_needed").eq("session_id", completedId).single();
      expect(data?.homework_not_needed).toBe(true);

      await coachPage.goto("/dashboard");
      await expect(coachPage.getByText("Session Tasks", { exact: true })).toBeVisible();
      await expect(homeworkTasks()).toHaveCount(0);
    });

    await test.step("取り消すと投稿のフォームに戻る", async () => {
      await coachPage.goto(`/students/${p.studentId}/sessions/${completedId}/result`);
      await coachPage.getByRole("button", { name: "Post homework instead" }).click();
      await expect(coachPage.getByPlaceholder("Instructions for the student (required)...")).toBeVisible();
      const { data } = await f.admin.from("com_t_session").select("homework_not_needed").eq("session_id", completedId).single();
      expect(data?.homework_not_needed).toBe(false);
    });
  } finally {
    await context.close();
  }
});
