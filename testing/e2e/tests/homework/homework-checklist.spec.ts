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
 * ライブセッションの宿題（機能: e2e/specs/homework/session-homework.md 手順2〜5）。
 * - 手順2〜3: コーチが投稿した宿題（チェックリスト2項目）を、生徒が通知のリンクから開いてチェックリストを完了し、コーチの結果画面の進捗に反映される
 * - 手順4: コーチの追記のコメントが生徒の画面に出て、宿題の通知（1セッション1件）が未読に戻る
 * - 手順5: 結果画面で投稿した宿題が、次回のセッションのハブの Last Homework に出る（投稿したセッション自身のハブには出ない）
 * 宿題の投稿の画面操作はジャーニー（tests/journeys/coach-live-session.spec.ts）で確かめているため、ここでは宿題を直接作る
 * （登録時のトリガーで生徒への通知が作られる）。使い捨てデータを作るため desktop だけで実行する。
 */

const PASSWORD = "Homework2026a";
const CHECKLIST = ["Listen to the dialogue twice", "Write three sentences with the new phrases"];

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

test("生徒が通知から宿題を開いてチェックリストを完了すると、コーチの画面の進捗に反映される", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  const f = await createAuthFixture("homework");
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);
  const homework = await createCompletedSessionWithHomework(f, p, scheduleId, { daysAgo: 1, checklist: CHECKLIST });

  // 生徒への通知（リンク先は生徒のセッション結果画面）
  const { data: notification } = await f.admin
    .from("com_t_notification").select("link_path, is_read")
    .eq("user_id", p.studentId).eq("notification_type", "HOMEWORK_POSTED").single();
  expect(notification).toMatchObject({ link_path: `/live-room/sessions/${homework.sessionId}/result`, is_read: false });

  await test.step("生徒: 宿題を開き、チェックリストを1項目ずつ完了する", async () => {
    await loginAsNewStudent(page, p.studentEmail, PASSWORD);
    await page.goto(notification!.link_path);
    const main = page.getByRole("main");
    await expect(main.getByText(homework.homeworkText)).toBeVisible();
    await expect(main.getByText("0/2 完了")).toBeVisible();

    for (const [index, itemText] of CHECKLIST.entries()) {
      const item = main.getByRole("button", { name: itemText });
      await expect(item).toHaveAttribute("aria-pressed", "false");
      await item.click();
      await expect(item).toHaveAttribute("aria-pressed", "true");
      await expect(main.getByText(`${index + 1}/2 完了`)).toBeVisible();
    }
    await expect(main.getByText("宿題を全て完了しました！お疲れ様でした。")).toBeVisible();

    // 画面は保存の完了を待たずに切り替わる（楽観的更新）ため、DB は保存が終わるまで待って確かめる
    await expect
      .poll(async () => {
        const { data: items } = await f.admin
          .from("com_t_session_homework_checklist_item")
          .select("is_done, done_at, com_t_session_homework!inner(session_id)")
          .eq("com_t_session_homework.session_id", homework.sessionId)
          .order("item_no");
        return (items ?? []).map((i) => i.is_done && i.done_at !== null);
      })
      .toEqual([true, true]);
  });

  await test.step("コーチ: 結果画面のチェックリストが 2/2 done になっている", async () => {
    const { context, page: coachPage } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
    try {
      await coachPage.goto(`/students/${p.studentId}/sessions/${homework.sessionId}/result`);
      await expect(coachPage.getByText(homework.homeworkText)).toBeVisible();
      await expect(coachPage.getByText("2/2 done")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test("コーチが追記のコメントを送ると、生徒の画面に出て、宿題の通知が未読に戻る（通知は1件のまま）", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  test.setTimeout(180_000);
  const f = await createAuthFixture("hwcomment");
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);
  const homework = await createCompletedSessionWithHomework(f, p, scheduleId, { daysAgo: 1 });
  const comment = `Please also add one sentence about your weekend (${f.tag}).`;

  const homeworkNotifications = async () => {
    const { data } = await f.admin
      .from("com_t_notification").select("is_read, occurred_at, dedup_key")
      .eq("user_id", p.studentId).eq("notification_type", "HOMEWORK_POSTED");
    return data ?? [];
  };
  // 生徒が通知を既読にした状態から始める
  const { error: readError } = await f.admin
    .from("com_t_notification").update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", p.studentId).eq("notification_type", "HOMEWORK_POSTED");
  if (readError) throw new Error(`通知の既読化に失敗しました: ${readError.message}`);
  const [before] = await homeworkNotifications();
  expect(before.is_read).toBe(true);

  await test.step("コーチ: 結果画面から追記のコメントを送る", async () => {
    const { context, page: coachPage } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
    try {
      await coachPage.goto(`/students/${p.studentId}/sessions/${homework.sessionId}/result`);
      await expect(coachPage.getByText(homework.homeworkText)).toBeVisible();
      const send = coachPage.getByRole("button", { name: "Send comment" });
      await expect(send).toBeDisabled();
      await coachPage.getByPlaceholder(/^Send a follow-up comment about this homework/).fill(comment);
      await send.click();
      await expect(coachPage.getByText(comment)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  await test.step("通知は同じ1件が未読に戻り、日時が新しくなる", async () => {
    await expect.poll(async () => (await homeworkNotifications()).map((n) => n.is_read)).toEqual([false]);
    const [after] = await homeworkNotifications();
    expect(after.dedup_key).toBe(homework.sessionId);
    expect(new Date(after.occurred_at).getTime()).toBeGreaterThan(new Date(before.occurred_at).getTime());
  });

  await test.step("生徒: セッション結果画面のフォローアップコメントに出る", async () => {
    await loginAsNewStudent(page, p.studentEmail, PASSWORD);
    await page.goto(`/live-room/sessions/${homework.sessionId}/result`);
    const main = page.getByRole("main");
    await expect(main.getByText(homework.homeworkText)).toBeVisible();
    await expect(main.getByText(comment)).toBeVisible();
    await expect(main.getByText("フォローアップコメントはまだありません。")).toHaveCount(0);
  });
});

test("結果画面で投稿した宿題が次回のセッションのハブの Last Homework に出て、投稿したセッション自身のハブには出ない", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
  test.setTimeout(180_000);
  const f = await createAuthFixture("hwlast");
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);

  // 前回（昨日）の実施済みのセッション（宿題なし）と、承認で作られた次回の予定のセッション
  const start = Date.now() - 24 * 60 * 60 * 1000;
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

    await test.step("次回のセッションのハブの Last Homework に出る", async () => {
      await coachPage.goto(`/students/${p.studentId}/sessions/${next.session_id}`);
      await expect(lastHomework(coachPage).getByText(instructions)).toBeVisible();
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
