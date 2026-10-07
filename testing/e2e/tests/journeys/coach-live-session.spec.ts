import { expect, test, type Page } from "@playwright/test";
import {
  cleanupAuthFixture,
  createAuthFixture,
  deleteFixtureChatRooms,
  prepareContent,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { confirmModal, coachNav, openCoachContext } from "../../support/coachApp.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
import {
  approveMatchingRequest,
  createPendingMatchingRequest,
  prepareLiveSessionDay,
  signOutLivePair,
  type LivePair,
  type LiveSessionDay,
} from "../../support/liveSessionFixtures.ts";

/**
 * コーチのライブセッション（ジャーニー: e2e/journeys/coach-live-session.md）
 *
 * 使い捨ての生徒（ライブ付き契約）とコーチを担当成立させ、実施当日の状態（前回の宿題・自主トレの実績・生徒からの未読チャット・
 * いま実施中のセッション）を作ってから、コーチの画面で1回分のライブセッションを通して操作する（support/liveSessionFixtures.ts）。
 * ビデオ通話（Zoom Video SDK）はE2Eでは扱わず、通話ルームが記録する入退室ログを直接入れて「通話した」状態にする。
 * ダイアログ教材のスライド（Google Slides）は開かずに、同じ内容の空ページを返す。
 * coach は PC 表示の別コンテキストで開くため desktop だけで実行する。
 * ダイアログ・確認画面を開く操作は、ステージング（本番ビルド）のハイドレーション前の押下に備えて clickUntilVisible で押す。
 */

const PASSWORD = "CoachLive2026a";

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

/** 担当成立済みの生徒・コーチと、実施当日の状態を作る */
async function setUpLiveSessionDay(prefix: string, options?: { studentMinutesInCall?: number }): Promise<{ f: AuthFixture; p: LivePair; day: LiveSessionDay }> {
  const f = await createAuthFixture(prefix);
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);
  const day = await prepareLiveSessionDay(f, p, scheduleId, options);
  return { f, p, day };
}

/** セッションハブ（没入表示） */
const hubPath = (p: LivePair, day: LiveSessionDay) => `/students/${p.studentId}/sessions/${day.sessionId}`;
/** 画面の区分（Session Info / Training / Prep / Self-Training 等の見出しを持つ section） */
const section = (page: Page, label: string) =>
  page.locator("section").filter({ has: page.getByText(label, { exact: true }) }).first();

test("ダッシュボードで今日のセッションと未読を確認し、生徒の状況を見てハブでスプリント・ダイアログを行い、終了して宿題を出す", async ({ browser }) => {
  test.setTimeout(240_000);
  const { f, p, day } = await setUpLiveSessionDay("coachlive");
  await prepareContent(f, 2);
  const { data: dialogueSessions } = await f.admin
    .from("com_m_dialogue_session").select("content_id").eq("session_no", 1).not("coach_slides_link", "is", null).eq("delete_flg", "0").limit(50);
  const dialogue = await prepareContent(f, 3, (dialogueSessions ?? []).map((d) => d.content_id));

  const { context, page } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  // 教材のスライド（別タブで開く Google Slides）は外部へ取りに行かない
  await context.route("https://docs.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>slides</title>" }));
  try {
    await test.step("1. ダッシュボード: 実施中のセッションが「Up next」で出て、生徒からの未読が1件ある", async () => {
      const next24 = page.locator("div").filter({ has: page.getByText("Next 24 Hours", { exact: true }) }).filter({ hasText: p.studentName }).last();
      await expect(next24).toContainText("Up next");
      await expect(page.getByRole("link", { name: /Unread Messages/ })).toContainText("1");
    });

    await test.step("2. チャット: 未読のタイルから開き、生徒のメッセージを読む", async () => {
      await page.getByRole("link", { name: /Unread Messages/ }).click();
      await expect(page).toHaveURL(/\/chat$/);
      await page.getByText(p.studentName).first().click();
      await expect(page.getByText(day.studentMessage)).toBeVisible();
    });

    await test.step("3. 生徒概要: 担当生徒の一覧から開き、次回のセッションからハブへ移る", async () => {
      await coachNav(page).getByRole("link", { name: "My Students", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "My Students" })).toBeVisible();
      await page.getByRole("main").getByText(p.studentName).first().click();
      await expect(page).toHaveURL(new RegExp(`/students/${p.studentId}$`));
      await expect(page.getByText("Next Live Session")).toBeVisible();
      await page.getByRole("link", { name: "Open Session" }).click();
      await expect(page).toHaveURL(new RegExp(`${hubPath(p, day)}$`));
    });

    await test.step("4. ハブ: 通話に入った記録があり、前回の宿題と直近の自主トレが見える", async () => {
      await expect(section(page, "Session Info")).toContainText("You joined");
      await expect(section(page, "Session Info").getByRole("button", { name: "End Session" })).toBeEnabled();
      await expect(section(page, "Prep")).toContainText(day.previousHomework);
      const selfTraining = section(page, "Self-Training");
      await expect(selfTraining).toContainText("2/7 days");
      await expect(selfTraining).toContainText("20");
    });

    await test.step("5. Live Sprint: ハブから開始し、全問を採点して結果を見てからハブへ戻る", async () => {
      await section(page, "Training").getByRole("link", { name: "Start" }).click();
      await expect(page).toHaveURL(new RegExp(`/students/${p.studentId}/lesson-sprint\\?session_id=${day.sessionId}`));
      const playerStart = page.getByRole("button", { name: "Start", exact: true });
      await clickUntilVisible(page.getByRole("button", { name: /^Start (\(YES\)|Live Sprint)/ }).first(), playerStart);
      await playerStart.click();

      // 1問ずつ「4」で採点する（最後の問題か制限時間切れで結果が保存される）
      const complete = page.getByText("Live Sprint Complete");
      const score = page.getByRole("button", { name: /^4\b/ });
      await expect(async () => {
        if (await complete.isVisible()) return;
        await score.click({ timeout: 2_000 });
        await expect(complete).toBeVisible({ timeout: 500 });
      }).toPass({ timeout: 120_000, intervals: [0] });

      await page.getByRole("button", { name: "View Results" }).click();
      await expect(page).toHaveURL(new RegExp(`/students/${p.studentId}/lesson-sprint/result/`));
      await page.getByRole("link", { name: "Done for now — back to Hub" }).click();
      await expect(page).toHaveURL(new RegExp(`${hubPath(p, day)}$`));
    });

    await test.step("6. ダイアログ: ハブで教材を割り当て、Session 1 のコーチ用スライドを開いて完了にする", async () => {
      // Training には Live Sprint とダイアログの2枚のカードがあり、割り当てる操作・割当済みの教材はダイアログのカードにだけある
      const training = section(page, "Training");
      const assignDialog = page.getByRole("dialog", { name: "Assign a Dialogue Practice set" });
      await clickUntilVisible(training.getByRole("button", { name: "Assign", exact: true }), assignDialog);
      const row = assignDialog
        .locator("div")
        .filter({ has: page.getByText(dialogue.content_name, { exact: true }) })
        .filter({ has: page.getByRole("button", { name: "Assign" }) })
        .last();
      // 教材のカテゴリのタブを開く（既定のタブに無い場合）
      for (const tab of await assignDialog.getByRole("tab").all()) {
        if (await row.isVisible()) break;
        await tab.click();
      }
      await row.getByRole("button", { name: "Assign" }).click();
      await expect(assignDialog).toHaveCount(0);

      const sessionsDialog = page.getByRole("dialog", { name: dialogue.content_name });
      await clickUntilVisible(training.getByRole("button").filter({ hasText: dialogue.content_name }), sessionsDialog);
      // Session 1 の行（見出し・完了ボタン・教材リンク・メモ）
      const session1 = sessionsDialog
        .locator("div")
        .filter({ has: page.getByText("Session 1", { exact: true }) })
        .filter({ has: page.getByRole("link", { name: "Coach Materials" }) })
        .last();
      const popupPromise = context.waitForEvent("page");
      await session1.getByRole("link", { name: "Coach Materials" }).click();
      await (await popupPromise).close();
      await session1.getByRole("button", { name: "Complete" }).click();
      await expect(session1).toContainText("Completed");
      await page.keyboard.press("Escape");
      await expect(sessionsDialog).toHaveCount(0);
    });

    await test.step("7. 終了: End Session で実施完了として記録され、結果画面にスプリントとダイアログの記録が出る", async () => {
      const modal = confirmModal(page);
      await clickUntilVisible(section(page, "Session Info").getByRole("button", { name: "End Session" }), modal);
      await expect(modal).toContainText("End session?");
      await modal.getByRole("button", { name: "End Session", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${hubPath(p, day)}/result$`));
      await expect(page.getByRole("heading", { level: 1, name: "Session Result" })).toBeVisible();
      await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("No Live Sprint was run in this session.")).toHaveCount(0);
      await expect(page.getByText(dialogue.content_name)).toBeVisible();
    });

    const instructions = `Practice the dialogue from Session 1 twice (${f.tag}).`;
    const checklistItem = "Record yourself reading Session 1";
    await test.step("8. 宿題: 指示文とチェックリストを付けて投稿する", async () => {
      await page.getByPlaceholder("Instructions for the student (required)...").fill(instructions);
      const checklistInput = page.getByPlaceholder(/^Add a checklist item/);
      await checklistInput.fill(checklistItem);
      await checklistInput.press("Enter");
      await page.getByRole("button", { name: "Post Homework" }).click();
      await expect(page.getByText(instructions)).toBeVisible();
      await expect(page.getByText(checklistItem)).toBeVisible();
      await expect(page.getByRole("button", { name: "Post Homework" })).toHaveCount(0);
    });

    await test.step("記録: セッション・チケット・スプリント・ダイアログ・宿題", async () => {
      const { admin } = f;
      const { data: session } = await admin.from("com_t_session").select("status, completion_result").eq("session_id", day.sessionId).single();
      expect(session).toMatchObject({ status: 2, completion_result: 1 });
      const { data: ticket } = await admin.from("com_t_user_session_ticket").select("used_sessions").eq("ticket_id", p.ticketId).single();
      expect(ticket?.used_sessions).toBe(1);
      const { count: sprintCount } = await admin
        .from("lesson_t_sprint").select("*", { count: "exact", head: true }).eq("session_id", day.sessionId);
      expect(sprintCount).toBe(1);
      const { count: dialogueLogCount } = await admin
        .from("com_t_session_dialogue_log").select("*", { count: "exact", head: true }).eq("session_id", day.sessionId);
      expect(dialogueLogCount).toBe(1);
      const { data: homework } = await admin.from("com_t_session_homework").select("homework_text").eq("session_id", day.sessionId).single();
      expect(homework?.homework_text).toBe(instructions);
    });

    await test.step("9. ダッシュボード: 実施したセッションは今後24時間の一覧と対応待ちから消える", async () => {
      await coachNav(page).getByRole("link", { name: "Dashboard", exact: true }).click();
      await expect(page.getByText("Next 24 Hours", { exact: true })).toBeVisible();
      await expect(page.getByText(p.studentName)).toHaveCount(0);
    });
  } finally {
    await context.close();
  }
});

test("通話の重なりが20分未満なら、理由を入力して早期終了として記録される", async ({ browser }) => {
  const { f, p, day } = await setUpLiveSessionDay("coachearly", { studentMinutesInCall: 10 });
  const reason = `Student had connectivity issues (${f.tag}).`;

  const { context, page } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await page.goto(hubPath(p, day));
    const modal = confirmModal(page);
    await clickUntilVisible(section(page, "Session Info").getByRole("button", { name: "End Session" }), modal);
    await modal.getByRole("button", { name: "End Session", exact: true }).click();

    const reasonDialog = page.getByRole("dialog", { name: "Session ended early" });
    await expect(reasonDialog.getByRole("button", { name: "Submit" })).toBeDisabled();
    await reasonDialog.getByRole("textbox").fill(reason);
    await reasonDialog.getByRole("button", { name: "Submit" }).click();

    await expect(page).toHaveURL(new RegExp(`${hubPath(p, day)}/result$`));
    await expect(page.getByText("Ended early", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(reason)).toBeVisible();

    const { data: session } = await f.admin.from("com_t_session").select("status, completion_result, status_note").eq("session_id", day.sessionId).single();
    expect(session).toMatchObject({ status: 2, completion_result: 2, status_note: reason });
    // 早期終了はチケットを消化しない
    const { data: ticket } = await f.admin.from("com_t_user_session_ticket").select("used_sessions").eq("ticket_id", p.ticketId).single();
    expect(ticket?.used_sessions).toBe(0);
  } finally {
    await context.close();
  }
});
