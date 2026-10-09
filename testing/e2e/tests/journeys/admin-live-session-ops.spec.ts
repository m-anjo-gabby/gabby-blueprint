import type { Locator, Page } from "@playwright/test";
import { cleanupAuthFixture, createAuthFixture, createDisposableCoach, deleteFixtureChatRooms, DISPOSABLE_EMAIL_DOMAIN, type AuthFixture } from "../../support/authFixtures.ts";
import { openAdminContext } from "../../support/adminApp.ts";
import { openCoachContext } from "../../support/coachApp.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
import {
  jstDateOf,
  jstSlot,
  jstSlotOn,
  liveRoomBreakdown,
  nextSessionSection,
  openLiveRoom,
  studentSlotText,
} from "../../support/liveRoomView.ts";
import {
  approveMatchingRequest,
  createPendingMatchingRequest,
  signOutLivePair,
  type LivePair,
} from "../../support/liveSessionFixtures.ts";
import { expect, loginAsNewStudent, test } from "../../support/studentApp.ts";

/**
 * アドミンのライブセッション運用対応（ジャーニー: e2e/journeys/admin-live-session-ops.md）
 *
 * 使い捨ての生徒（週1回・12回のライブ付き契約）とコーチを担当成立させ（毎週金曜 20:00〜20:25、日本時間）、1回目を実施済みにした状態から、
 * アドミンがライブセッション管理の画面で代理キャンセル → 予約し直し → コーチ交代 → 別のコーチと直接マッチング → 回数の個別調整と予約を行い、
 * 生徒・コーチの画面に反映され、契約の回数（交代前に使った回の差し引き）が保たれること、アドミンの操作を生徒・コーチへ通知しない
 * （直接マッチングの成立時の、新しいコーチの名義の挨拶のチャットだけが届く）ことを確かめる
 * （support/liveSessionFixtures.ts）。admin・coach は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = "AdminLiveOps2026a";
const HOUR_MS = 60 * 60 * 1000;
const LESSON_MS = 25 * 60 * 1000;

let fixture: AuthFixture | undefined;
let pair: LivePair | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、admin・coach は PC 表示の別コンテキストで開くため desktop だけで実行する");
});

test.afterEach(async () => {
  await signOutLivePair(pair);
  pair = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** admin のセッション一覧の日時の表記（LiveSessionManagementView の formatSessionDateTime と同じ `yyyy/MM/dd (E) HH:mm`。日本時間） */
function adminSessionText(iso: string): string {
  const weekday = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", weekday: "short" }).format(new Date(iso));
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return `${jstDateOf(iso).replaceAll("-", "/")} (${weekday}) ${time}`;
}

/** 定期スケジュール枠の行（稼働中・終了済みの枠は「第n枠: 曜日 時刻〜時刻（タイムゾーン）」、未割当の枠は案内文で絞る） */
const slotRow = (page: Page, text: string): Locator => page.getByTestId("schedule-slot").filter({ hasText: text });

/** セッション一覧のタブを開き、そのタブの一覧を返す */
async function openSessionTab(page: Page, name: "今後の予定" | "実施済み" | "変更履歴"): Promise<Locator> {
  await page.getByRole("tab", { name }).click();
  return page.getByRole("tabpanel", { name });
}

/** 代理予約のダイアログで日付・開始時刻（アドミンのブラウザの時刻＝日本時間）を入れて予約する */
async function bookAsAdmin(page: Page, row: Locator, slot: { date: string; time: string }): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "セッションの予約（代理操作）" });
  await clickUntilVisible(row.getByRole("button", { name: "セッションを予約" }), dialog);
  await dialog.locator("input[type=date]").fill(slot.date);
  await dialog.locator("select").selectOption(slot.time);
  await dialog.getByRole("button", { name: "予約する" }).click();
  await expect(page.getByText("セッションを予約しました")).toBeVisible();
  await expect(dialog).toHaveCount(0);
}

test("アドミンが代理キャンセル・予約・コーチ交代・直接マッチング・回数の調整をしても、契約の回数どおりに予定が入る", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const f = await createAuthFixture("adminliveops");
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const scheduleId = await approveMatchingRequest(f, p);
  const clientName = `【QAテスト】認証E2E（${f.tag}）`;

  const { data: generated } = await f.admin
    .from("com_t_session").select("session_id, start_datetime, end_datetime").eq("schedule_id", scheduleId).eq("status", 1).order("start_datetime");
  const total = generated!.length;
  expect(total).toBe(12);
  // 1回目は実施済みにする（3時間前に正常終了。コーチ交代の後の目標回数から差し引かれる回）
  const [done, target] = generated!;
  const doneStart = Date.now() - 3 * HOUR_MS;
  const { error: doneError } = await f.admin
    .from("com_t_session")
    .update({ start_datetime: new Date(doneStart).toISOString(), end_datetime: new Date(doneStart + LESSON_MS).toISOString(), status: 2, completion_result: 1 })
    .eq("session_id", done.session_id);
  if (doneError) throw new Error(`実施済みにできませんでした: ${doneError.message}`);

  // 交代後のコーチ（空き時間は UTC の水曜 10:00〜13:00＝日本時間 19:00〜22:00）
  const coachB = { email: `${f.tag}-coach2@${DISPOSABLE_EMAIL_DOMAIN}`, name: `E2E Coach2 ${f.tag}` };
  const coachBId = await createDisposableCoach(f, {
    email: coachB.email,
    password: PASSWORD,
    userName: coachB.name,
    timezone: "Asia/Tokyo",
    availability: [{ dayOfWeek: 3, startTime: "10:00:00", endTime: "13:00:00" }],
  });

  // 代理キャンセルした回を、同じ日の1時間後（金曜 21:00）へ予約し直す。回数の個別調整で足した1回は2日後の 10:00
  const moved = jstSlotOn(jstDateOf(target.start_datetime), "21:00");
  const extra = jstSlot(2, "10:00");
  const slotA = "第1枠: 金曜 20:00〜20:25（Asia/Tokyo）";
  const slotB = "第1枠: 水曜 20:00〜20:25（Asia/Tokyo）";

  /**
   * アドミンの操作の後に生徒・コーチ（交代前・交代後）へ登録された通知（fn_notify は管理者の操作では登録しない）。
   * 直接マッチングの成立時だけは、新しいコーチの名義の挨拶のチャットが生徒に届き、チャットの新着として通知される。
   */
  const opsStartedAt = new Date().toISOString();
  const expectNotifications = async (expected: { user_id: string; notification_type: string }[]) => {
    const { data: notifications } = await f.admin
      .from("com_t_notification").select("user_id, notification_type")
      .in("user_id", [p.studentId, p.coachId, coachBId]).gte("insert_date", opsStartedAt);
    expect(notifications).toEqual(expected);
  };

  const { context: adminContext, page: admin } = await openAdminContext(browser);
  try {
    await test.step("1. アドミン: 顧客・生徒を選ぶと現在の契約が選ばれ、担当の枠と予定が出る", async () => {
      await admin.goto("/live-sessions");
      await expect(admin.getByRole("heading", { level: 1, name: "ライブセッション管理" })).toBeVisible();
      const [clientSelect, studentSelect] = [admin.getByRole("combobox").nth(0), admin.getByRole("combobox").nth(1)];
      await clickUntilVisible(clientSelect, admin.getByPlaceholder("顧客名で検索..."));
      await admin.getByPlaceholder("顧客名で検索...").fill(f.tag);
      await admin.getByRole("option", { name: clientName }).click();
      await expect(studentSelect).toBeEnabled();
      await studentSelect.click();
      await admin.getByPlaceholder("生徒名・メールで検索...").fill(f.tag);
      await admin.getByRole("option", { name: `${p.studentName}（${p.studentEmail}）` }).click();

      await expect(admin.getByRole("combobox").nth(2)).toContainText("現在の契約");
      await expect(admin.getByText("全1枠中 稼働1枠・未割当0枠")).toBeVisible();
      const row = slotRow(admin, slotA);
      await expect(row).toContainText("稼働中");
      await expect(row).toContainText(`担当コーチ: ${p.coachName}`);
      await expect(row).toContainText(`総セッション数: ${total}`);
      await expect(row).not.toContainText("未割当");
      await expect((await openSessionTab(admin, "今後の予定")).getByRole("listitem")).toHaveCount(total - 1);
      await expect((await openSessionTab(admin, "実施済み")).getByRole("listitem")).toHaveCount(1);
    });

    await test.step("2. アドミン: 2回目を代理キャンセルする（返還あり）と、その枠に未割当が1件できる", async () => {
      const upcoming = await openSessionTab(admin, "今後の予定");
      const item = upcoming.getByRole("listitem").filter({ hasText: adminSessionText(target.start_datetime) });
      const dialog = admin.getByRole("dialog", { name: "セッションのキャンセル（代理操作）" });
      await clickUntilVisible(item.getByRole("button", { name: "キャンセル" }), dialog);
      await expect(dialog.getByRole("checkbox", { name: /チケットを返還する/ })).toBeChecked();
      await dialog.getByRole("textbox").fill("生徒の依頼で同じ日の21時へ変更");
      await dialog.getByRole("button", { name: "キャンセルする" }).click();
      await expect(admin.getByText("セッションをキャンセルしました")).toBeVisible();
      await expect(dialog).toHaveCount(0);

      await expect(slotRow(admin, slotA)).toContainText("未割当 1件");
      const changes = await openSessionTab(admin, "変更履歴");
      await expect(changes.getByRole("listitem").filter({ hasText: adminSessionText(target.start_datetime) })).toContainText("キャンセル（アドミン代理）");
      const { data: cancelled } = await f.admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("session_id", target.session_id).single();
      expect(cancelled).toMatchObject({ status: 3, cancel_category: 3, ticket_refunded: true });
    });

    await test.step("3. アドミン: 未割当の1件で同じ日の21時に予約し直す", async () => {
      const row = slotRow(admin, slotA);
      await bookAsAdmin(admin, row, moved);
      await expect(row).not.toContainText("未割当");
      const upcoming = await openSessionTab(admin, "今後の予定");
      await expect(upcoming.getByRole("listitem").filter({ hasText: adminSessionText(moved.startIso) })).toContainText("予定");
      await expect(upcoming.getByRole("listitem")).toHaveCount(total - 1);
    });

    await test.step("4. 生徒: 予約し直した日時が次回のセッションに出て、契約の回数が変わっていない（通知は届かない）", async () => {
      await loginAsNewStudent(page, p.studentEmail, PASSWORD);
      await openLiveRoom(page);
      await expect(nextSessionSection(page)).toContainText(studentSlotText(moved.startIso, moved.endIso));
      await expect(nextSessionSection(page)).toContainText(`${p.coachName} コーチ`);
      await expect(liveRoomBreakdown(page, { completed: 1, scheduled: total - 1 })).toBeVisible();
      await expectNotifications([]);
    });

    await test.step("5. アドミン: コーチ交代で枠を終了すると、今後の予定がキャンセルされて未割当の枠になる", async () => {
      const row = slotRow(admin, slotA);
      const confirm = admin.getByRole("alertdialog", { name: "担当コーチの交代" });
      await clickUntilVisible(row.getByRole("button", { name: "コーチ交代" }), confirm);
      await confirm.getByRole("button", { name: "実行する" }).click();
      await expect(admin.getByText("担当コーチの枠を終了しました。生徒は新しいコーチへ再度リクエストできます")).toBeVisible();

      await expect(row).toContainText("終了済み");
      await expect(row.getByRole("button")).toHaveCount(0);
      await expect(admin.getByText("全1枠中 稼働0枠・未割当1枠")).toBeVisible();
      await expect(slotRow(admin, "まだコーチが割り当てられていません")).toContainText("第1枠");
      await expect((await openSessionTab(admin, "今後の予定")).getByText("該当するセッションはありません")).toBeVisible();
      const changes = await openSessionTab(admin, "変更履歴");
      await expect(changes.getByRole("listitem").filter({ hasText: adminSessionText(moved.startIso) })).toContainText("キャンセル（コーチ交代）");
      // 実施済みの回は残る
      await expect((await openSessionTab(admin, "実施済み")).getByRole("listitem")).toHaveCount(1);
    });

    await test.step("6. アドミン: 未割当の枠を別のコーチと直接マッチングすると、交代前に実施した1回を除いた回数で予定が入る", async () => {
      const dialog = admin.getByRole("dialog", { name: "コーチと直接マッチング" });
      await clickUntilVisible(slotRow(admin, "まだコーチが割り当てられていません").getByRole("button", { name: "直接マッチング" }), dialog);
      await dialog.getByRole("combobox").first().click();
      await admin.getByPlaceholder("コーチ名で検索...").fill(coachB.name);
      await admin.getByRole("option", { name: coachB.name, exact: true }).click();
      await expect(dialog.getByRole("spinbutton")).toHaveValue("1");
      await dialog.locator("select").nth(0).selectOption({ label: "水曜" });
      await dialog.locator("select").nth(1).selectOption("20:00");
      await dialog.getByRole("button", { name: "マッチングを成立させる" }).click();
      await expect(admin.getByText("マッチングが成立しました。セッションが予約されました")).toBeVisible();
      await expect(dialog).toHaveCount(0);

      await expect(admin.getByText("全1枠中 稼働1枠・未割当0枠")).toBeVisible();
      const row = slotRow(admin, slotB);
      await expect(row).toContainText("稼働中");
      await expect(row).toContainText(`担当コーチ: ${coachB.name}`);
      await expect(row).toContainText(`総セッション数: ${total - 1}`);
      await expect(row).not.toContainText("未割当");
      await expect((await openSessionTab(admin, "今後の予定")).getByRole("listitem")).toHaveCount(total - 1);
    });

    await test.step("7. アドミン: 交代の埋め合わせに総セッション数を1回増やし、増えた未割当で予約する", async () => {
      const row = slotRow(admin, slotB);
      const dialog = admin.getByRole("dialog", { name: "セッション数の個別調整" });
      await clickUntilVisible(row.getByRole("button", { name: "セッション数を調整" }), dialog);
      await expect(dialog.getByRole("button", { name: "変更する" })).toBeDisabled();
      await expect(dialog.getByRole("spinbutton")).toHaveValue(String(total));
      await dialog.getByRole("textbox").fill("コーチ交代の埋め合わせとして1回追加（顧客と合意済み）");
      await dialog.getByRole("button", { name: "変更する" }).click();
      await expect(admin.getByText("総セッション数を変更しました")).toBeVisible();
      await expect(dialog).toHaveCount(0);
      await expect(row).toContainText(`総セッション数: ${total}`);
      await expect(row).toContainText("未割当 1件");

      await bookAsAdmin(admin, row, extra);
      await expect(row).not.toContainText("未割当");
      await expect((await openSessionTab(admin, "今後の予定")).getByRole("listitem")).toHaveCount(total);
    });
  } finally {
    await adminContext.close();
  }

  await test.step("8. 生徒・新しいコーチ: 新しいコーチの予定が入り、契約の回数を1回超えて予約済みになる（届くのは新しいコーチの挨拶のチャットだけ）", async () => {
    await openLiveRoom(page);
    await expect(nextSessionSection(page)).toContainText(`${coachB.name} コーチ`);
    await expect(page.getByRole("main")).toContainText(studentSlotText(extra.startIso, extra.endIso));
    // 内訳の合計（実施済み1回＋予約済み12回）が契約の回数（12回）を超えるため、バーの分母は合計になる
    await expect(liveRoomBreakdown(page, { completed: 1, scheduled: total })).toBeVisible();

    const { context: coachContext, page: coach } = await openCoachContext(browser, { email: coachB.email, password: PASSWORD });
    try {
      await coach.goto("/students");
      await expect(coach.getByRole("heading", { level: 1, name: "My Students" })).toBeVisible();
      await expect(coach.getByRole("main")).toContainText(p.studentName);
    } finally {
      await coachContext.close();
    }
    // 届いたのは新しいコーチからの挨拶のチャットだけ
    await expectNotifications([{ user_id: p.studentId, notification_type: "CHAT_NEW_MESSAGE" }]);
    const { data: greeting } = await f.admin.from("com_t_chat").select("message").eq("sender_user_id", coachBId).single();
    expect(greeting!.message).toContain("Thank you for choosing me as your Gabby Coach!");
  });
});
