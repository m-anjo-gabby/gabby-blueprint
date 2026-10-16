import { formatDateTimeEn } from "@gabby/lib/date/dateEn";
import { cleanupAuthFixture, createAuthFixture, deleteFixtureChatRooms, type AuthFixture } from "../../support/authFixtures.ts";
import { confirmModal, openCoachContext } from "../../support/coachApp.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
import {
  approveMatchingRequest,
  createPendingMatchingRequest,
  signOutLivePair,
  type LivePair,
} from "../../support/liveSessionFixtures.ts";
import { fillSlot, jstSlot, liveRoomBreakdown as breakdown, nextSessionSection, openLiveRoom, studentSlotText } from "../../support/liveRoomView.ts";
import { expect, loginAsNewStudent, test } from "../../support/studentApp.ts";

/**
 * ライブセッションの日程変更（ジャーニー: e2e/journeys/live-session-reschedule.md）
 *
 * 使い捨ての生徒（週1回のライブ付き契約）とコーチを担当成立させ（契約期間分の毎週金曜 20:00〜20:25 の予定が入る）、
 * 生徒・コーチの画面を行き来して、キャンセル・振替候補・予約リクエストで日程を変えても契約の回数が保たれることを確かめる
 * （support/liveSessionFixtures.ts）。生徒・コーチとも日本時間。候補・リクエストの日時は午前にして、毎週の予定と重ねない。
 * coach は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = "LiveReschedule2026a";
const TZ = "Asia/Tokyo";

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

test("生徒・コーチがキャンセル・振替・予約リクエストで日程を変えても、契約の回数が保たれる", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const f = await createAuthFixture("livereschedule");
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);

  const { data: schedule } = await f.admin.from("com_m_lesson_schedule").select("target_sessions").eq("schedule_id", scheduleId).single();
  const { data: generated } = await f.admin
    .from("com_t_session").select("session_id, start_datetime, end_datetime").eq("schedule_id", scheduleId).eq("status", 1).order("start_datetime");
  const total = schedule!.target_sessions as number;
  // 契約期間（90日）に毎週の予定が契約の回数分入っている（未予約0回から始める）
  expect(generated).toHaveLength(total);
  const [first, second] = generated!;

  // 生徒が出す振替候補2件（コーチが2件目を選ぶ）・コーチが出す候補・生徒の予約リクエスト
  const studentCandidates = [jstSlot(3, "10:00"), jstSlot(4, "10:00")];
  const coachCandidate = jstSlot(5, "10:00");
  const bookingSlot = jstSlot(6, "11:00");

  await loginAsNewStudent(page, p.studentEmail, PASSWORD);

  await test.step("1. 生徒: ライブセッションホームで次回の予定と、契約の回数がすべて予約済みであることを確認する", async () => {
    await openLiveRoom(page);
    await expect(nextSessionSection(page)).toContainText(studentSlotText(first.start_datetime, first.end_datetime));
    await expect(breakdown(page, { scheduled: total, adjusting: 0, unbooked: 0 })).toBeVisible();
    await expect(page.getByText("対応が必要です")).toHaveCount(0);
  });

  await test.step("2. 生徒: 次回の回をキャンセルし、振替候補を2件提案する（返還される）", async () => {
    const dialog = page.getByRole("dialog", { name: "セッションをキャンセル" });
    await clickUntilVisible(page.getByRole("button", { name: "この回をキャンセル" }), dialog);
    await expect(dialog).toContainText("この回の予約枠が返還され");
    for (const [index, slot] of studentCandidates.entries()) {
      await dialog.getByRole("button", { name: "候補を追加" }).click();
      await fillSlot(dialog, index, slot);
    }
    await dialog.getByRole("button", { name: "キャンセルする" }).click();
    await expect(page.getByText("セッションをキャンセルしました。提案した候補をコーチへ送信しました。")).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // 提案した候補は今後の予定に「回答待ち」で出て、その回は未予約ではなく調整中になる（同じ回で予約リクエストを重ねられない）
    const proposal = page.getByRole("listitem").filter({ hasText: "振替の候補・回答待ち" });
    for (const slot of studentCandidates) await expect(proposal).toContainText(studentSlotText(slot.startIso, slot.endIso));
    await expect(breakdown(page, { scheduled: total - 1, adjusting: 1, unbooked: 0 })).toBeVisible();
    await expect(page.getByText("対応が必要です")).toHaveCount(0);

    const { data: cancelled } = await f.admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("session_id", first.session_id).single();
    expect(cancelled).toMatchObject({ status: 3, cancel_category: 1, ticket_refunded: true });
  });

  const { context: coachContext, page: coach } = await openCoachContext(browser, { email: p.coachEmail, password: PASSWORD });
  try {
    await test.step("3. コーチ: ダッシュボードの Requests からカレンダーを開き、振替候補の2件目で予約する", async () => {
      const requests = coach.getByRole("main").getByRole("link", { name: /^Requests/ });
      await expect(requests).toContainText("1");
      await requests.click();
      await expect(coach).toHaveURL(/\/calendar/);
      const card = coach.locator("article").filter({ hasText: "Reschedule Proposal" }).filter({ hasText: p.studentName });
      await expect(card).toContainText(`Originally scheduled for ${formatDateTimeEn(first.start_datetime, TZ)}`);
      await card.getByRole("radio", { name: formatDateTimeEn(studentCandidates[1].startIso, TZ) }).check();
      await card.getByRole("button", { name: "Book selected time" }).click();
      await expect(coach.getByText("Booked the selected time.")).toBeVisible();
      await expect(card).toHaveCount(0);

      // 選んだ候補でセッションが作られ、残りの候補は不採用になる
      const { data: proposals } = await f.admin
        .from("com_t_session_slot_proposal").select("proposed_start_datetime, status").eq("source_session_id", first.session_id).order("proposed_start_datetime");
      expect(proposals?.map((r) => r.status)).toEqual([3, 2]);
    });

    await test.step("4. 生徒: 振替の日時が予定に入り、回数が元に戻る", async () => {
      await openLiveRoom(page);
      await expect(page.getByRole("main")).toContainText(studentSlotText(studentCandidates[1].startIso, studentCandidates[1].endIso));
      await expect(page.getByText("振替の候補・回答待ち")).toHaveCount(0);
      await expect(breakdown(page, { scheduled: total, adjusting: 0, unbooked: 0 })).toBeVisible();
    });

    await test.step("5. コーチ: 生徒概要の Live Sessions で毎週の予定の回をキャンセルし、振替候補を1件提案する", async () => {
      // 担当生徒の一覧から開く操作は coach-live-session.spec.ts で確かめているため、生徒概要を直接開く
      await coach.goto(`/students/${p.studentId}`);
      const row = coach
        .locator("li")
        .filter({ hasText: formatDateTimeEn(second.start_datetime, TZ) })
        .filter({ has: coach.getByRole("button", { name: "Cancel" }) });
      const dialog = coach.getByRole("dialog", { name: "Cancel Session" });
      await clickUntilVisible(row.getByRole("button", { name: "Cancel" }), dialog);
      await dialog.getByRole("button", { name: "Add time" }).click();
      await fillSlot(dialog, 0, coachCandidate);
      await dialog.getByRole("button", { name: "Cancel Session" }).click();
      await expect(coach.getByText("Session cancelled. Your proposed times were sent to the student.")).toBeVisible();

      const { data: cancelled } = await f.admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("session_id", second.session_id).single();
      expect(cancelled).toMatchObject({ status: 3, cancel_category: 2, ticket_refunded: true });
    });

    await test.step("6. 生徒: 届いた候補を見送り、続けて開く予約リクエストで別の日時をリクエストする", async () => {
      await openLiveRoom(page);
      await expect(breakdown(page, { scheduled: total - 1, adjusting: 1, unbooked: 0 })).toBeVisible();
      const card = page.locator("section").filter({ hasText: `${p.coachName}コーチの都合でキャンセルになりました` });
      await expect(card.getByRole("radio")).toHaveText([studentSlotText(coachCandidate.startIso, coachCandidate.endIso)]);

      const modal = confirmModal(page);
      await clickUntilVisible(card.getByRole("button", { name: "候補以外の日時を希望する" }), modal);
      await modal.getByRole("button", { name: "見送る" }).click();

      const dialog = page.getByRole("dialog", { name: "セッションを予約" });
      await expect(dialog).toBeVisible();
      await fillSlot(dialog, 0, bookingSlot);
      await dialog.getByRole("button", { name: "リクエストする" }).click();
      await expect(page.getByText("予約をリクエストしました。コーチの承認をお待ちください。")).toBeVisible();
      await expect(dialog).toHaveCount(0);

      await expect(card).toHaveCount(0);
      const request = page.getByRole("listitem").filter({ hasText: "承認待ち" });
      await expect(request).toContainText(studentSlotText(bookingSlot.startIso, bookingSlot.endIso));
      await expect(breakdown(page, { scheduled: total - 1, adjusting: 1, unbooked: 0 })).toBeVisible();
      // 見送った候補は不採用になる
      const { data: declined } = await f.admin.from("com_t_session_slot_proposal").select("status").eq("source_session_id", second.session_id);
      expect(declined?.map((r) => r.status)).toEqual([3]);
    });

    await test.step("7. コーチ: カレンダーの Pending Requests で予約リクエストを承認する", async () => {
      await coach.goto("/calendar");
      const card = coach.locator("article").filter({ hasText: "New Booking" }).filter({ hasText: p.studentName });
      await expect(card).toContainText(formatDateTimeEn(bookingSlot.startIso, TZ));
      const modal = confirmModal(coach);
      await clickUntilVisible(card.getByRole("button", { name: "Approve" }), modal);
      await modal.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(coach.getByText("Request approved. The session has been booked.")).toBeVisible();
      await expect(card).toHaveCount(0);
    });

    await test.step("8. 生徒: リクエストした日時が予定に入り、契約の回数が変わっていない", async () => {
      await openLiveRoom(page);
      await expect(page.getByRole("main")).toContainText(studentSlotText(bookingSlot.startIso, bookingSlot.endIso));
      await expect(page.getByRole("listitem").filter({ hasText: "承認待ち" })).toHaveCount(0);
      await expect(breakdown(page, { scheduled: total, adjusting: 0, unbooked: 0 })).toBeVisible();

      const { count } = await f.admin
        .from("com_t_session").select("session_id", { count: "exact", head: true }).eq("schedule_id", scheduleId).eq("status", 1);
      expect(count).toBe(total);
    });
  } finally {
    await coachContext.close();
  }
});
