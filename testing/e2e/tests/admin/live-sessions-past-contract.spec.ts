import { cleanupAuthFixture, createAuthFixture, deleteFixtureChatRooms, grantLiveLicense, type AuthFixture } from "../../support/authFixtures.ts";
import { openAdminContext, openLiveSessionsFor, scheduleSlotRow } from "../../support/adminApp.ts";
import { approveMatchingRequest, createPendingMatchingRequest, signOutLivePair, type LivePair } from "../../support/liveSessionFixtures.ts";
import { expect, test } from "../../support/studentApp.ts";

/**
 * ライブセッション管理で過去の契約を選ぶと参照のみになる（仕様書: e2e/specs/admin/live-session-management.md 異常系 #3）。
 *
 * 使い捨ての生徒に、終了済みの週2回の契約（1枠目は担当ありで実施済み2回・未割当が残る、2枠目は未割当）と、
 * 現在の週1回の契約（担当成立済み）を持たせ、過去の契約では操作のボタンが1つも出ないこと、現在の契約に戻すと出ることを確かめる。
 * admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = "PastContract2026a";
const DAY_MS = 24 * 60 * 60 * 1000;
const OPERATION_BUTTONS = /^(セッションを予約|セッション数を調整|コーチ交代|直接マッチング|キャンセル)$/;

let fixture: AuthFixture | undefined;
let pair: LivePair | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、admin は PC 表示の別コンテキストで開くため desktop だけで実行する");
});

test.afterEach(async () => {
  await signOutLivePair(pair);
  pair = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

test("過去の契約を選ぶと参照のみになり、枠・セッションの操作のボタンが出ない", async ({ browser }) => {
  test.setTimeout(180_000);
  const f = await createAuthFixture("pastcontract");
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  await approveMatchingRequest(f, p);

  // 終了済みの契約（120日前〜30日前、週2回）。1枠目は同じコーチが担当し、実施済みが2回（未割当が残る）
  const pastStart = new Date(Date.now() - 120 * DAY_MS);
  const pastEnd = new Date(Date.now() - 30 * DAY_MS);
  const { ticketId: pastTicketId } = await grantLiveLicense(f, p.studentId, { planCode: "LIVE_WEEKLY2_3M", label: "past", start: pastStart, end: pastEnd });
  const { data: schedule, error: scheduleError } = await f.admin
    .from("com_m_lesson_schedule")
    .insert({
      ticket_id: pastTicketId,
      student_id: p.studentId,
      coach_id: p.coachId,
      slot_no: 1,
      day_of_week: 2,
      start_time: "20:00:00",
      end_time: "20:25:00",
      schedule_timezone: "Asia/Tokyo",
      status: 1,
      start_date: pastStart.toISOString().slice(0, 10),
      end_date: pastEnd.toISOString().slice(0, 10),
      target_sessions: 12,
    })
    .select("schedule_id")
    .single();
  if (scheduleError || !schedule) throw new Error(`過去の契約の担当枠の作成に失敗しました: ${scheduleError?.message}`);
  const { error: sessionError } = await f.admin.from("com_t_session").insert(
    [60, 53].map((daysAgo) => {
      const start = Date.now() - daysAgo * DAY_MS;
      return {
        schedule_id: schedule.schedule_id,
        ticket_id: pastTicketId,
        student_id: p.studentId,
        coach_id: p.coachId,
        start_datetime: new Date(start).toISOString(),
        end_datetime: new Date(start + 25 * 60 * 1000).toISOString(),
        status: 2,
        completion_result: 1,
      };
    })
  );
  if (sessionError) throw new Error(`過去の契約のセッションの作成に失敗しました: ${sessionError.message}`);

  const { context, page: admin } = await openAdminContext(browser);
  try {
    await openLiveSessionsFor(admin, { tag: f.tag, clientName: `【QAテスト】認証E2E（${f.tag}）`, studentName: p.studentName, studentEmail: p.studentEmail });
    const contractSelect = admin.getByRole("combobox").nth(2);
    const main = admin.getByRole("main");

    await test.step("現在の契約が既定で選ばれ、操作のボタンが出る", async () => {
      await expect(contractSelect).toContainText("現在の契約");
      await expect(admin.getByText("過去契約（参照のみ）")).toHaveCount(0);
      await expect(scheduleSlotRow(admin, "第1枠: 金曜 20:00〜20:25（Asia/Tokyo）").getByRole("button", { name: "コーチ交代" })).toBeVisible();
    });

    await test.step("過去の契約を選ぶと「過去契約（参照のみ）」になり、枠・セッションの操作のボタンが1つも出ない", async () => {
      await contractSelect.selectOption(pastTicketId);
      await expect(admin.getByText("過去契約（参照のみ）")).toBeVisible();
      await expect(admin.getByText("全2枠中 稼働1枠・未割当1枠")).toBeVisible();

      // 担当ありの枠は内容（未割当の件数を含む）だけを出し、未割当の枠の行（直接マッチング）は出さない
      const assigned = scheduleSlotRow(admin, "第1枠: 火曜 20:00〜20:25（Asia/Tokyo）");
      await expect(assigned).toContainText("未割当 10件");
      await expect(admin.getByTestId("schedule-slot")).toHaveCount(1);
      await expect(main.getByRole("button", { name: OPERATION_BUTTONS })).toHaveCount(0);

      await admin.getByRole("tab", { name: "実施済み" }).click();
      const completed = admin.getByRole("tabpanel", { name: "実施済み" }).getByRole("listitem");
      await expect(completed).toHaveCount(2);
      await expect(main.getByRole("button", { name: OPERATION_BUTTONS })).toHaveCount(0);
    });

    await test.step("現在の契約に戻すと、操作のボタンが出る", async () => {
      await contractSelect.selectOption({ label: (await contractSelect.locator("option").filter({ hasText: "現在の契約" }).textContent())! });
      await expect(admin.getByText("過去契約（参照のみ）")).toHaveCount(0);
      await expect(scheduleSlotRow(admin, "第1枠: 金曜 20:00〜20:25（Asia/Tokyo）").getByRole("button", { name: "コーチ交代" })).toBeVisible();
    });
  } finally {
    await context.close();
  }
});
