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
 * ライブセッションの宿題（機能: e2e/specs/homework/session-homework.md 手順2〜3）。
 * コーチが投稿した宿題（チェックリスト2項目）を、生徒が通知のリンクから開いてチェックリストを完了し、コーチの結果画面の進捗に反映されることを確かめる。
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
