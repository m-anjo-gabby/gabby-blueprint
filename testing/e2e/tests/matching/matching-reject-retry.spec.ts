import type { Page } from "@playwright/test";
import { signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { cleanupAuthFixture, createAuthFixture, deleteFixtureChatRooms, type AuthFixture } from "../../support/authFixtures.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
import { createPendingMatchingRequest, signOutLivePair, type LivePair } from "../../support/liveSessionFixtures.ts";
import { expect, loginAsNewStudent, test } from "../../support/studentApp.ts";

/**
 * 否認された申請の再申請（仕様: e2e/specs/matching/coach-matching.md 4b・異常系 #7）。
 * - コーチが理由つきで否認すると、生徒に通知が届き、マッチング画面の枠に「前回否認理由」が出る
 * - 同じ枠（同じコーチ・同じ曜日時刻）へ画面から再申請でき、枠は承認待ちになって理由の表示が消える
 * - 承認待ちの枠へもう一度申請すると、一意制約で拒否される（#7。画面では枠が承認待ちになり導線が無いため、本人のログインで直接登録する）
 *
 * 否認の画面操作はコーチのテスト（tests/coach/matching-requests.spec.ts）で確かめているため、ここではコーチ本人のログインで RPC を呼ぶ。
 * 使い捨ての生徒・コーチ（日本時間）を作るため desktop だけで実行する。
 */

const PASSWORD = "MatchRetry2026a";

let fixture: AuthFixture | undefined;
let pair: LivePair | undefined;

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
});

test.afterEach(async () => {
  await signOutLivePair(pair);
  pair = undefined;
  await deleteFixtureChatRooms(fixture);
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** マッチング画面の「nコマ目」の枠 */
const slotCard = (page: Page, slotNo: number) =>
  page.locator("div.rounded-card").filter({ has: page.getByText(`${slotNo}コマ目`, { exact: true }) });

test("否認されると枠に前回否認理由が出て、同じ枠へ再申請でき、承認待ちの枠への重複した申請は拒否される", async ({ page }) => {
  test.setTimeout(180_000);
  const f = await createAuthFixture("matchretry");
  fixture = f;
  const p = await createPendingMatchingRequest(f, PASSWORD);
  pair = p;
  const reason = `The time slot no longer fits my schedule (${f.tag}).`;

  await test.step("コーチ: 理由をつけて否認する", async () => {
    const coachClient = await signInAsRole(p.coachEmail, PASSWORD);
    try {
      const { error } = await coachClient.rpc("reject_matching_request", { p_request_id: p.requestId, p_reason: reason });
      expect(error).toBeNull();
    } finally {
      await signOutRole(coachClient);
    }
    const { count } = await f.admin
      .from("com_t_notification").select("notification_id", { count: "exact", head: true })
      .eq("user_id", p.studentId).eq("notification_type", "MATCHING_REJECTED");
    expect(count).toBe(1);
  });

  await loginAsNewStudent(page, p.studentEmail, PASSWORD);
  await page.goto("/coach-matching");
  const slot = slotCard(page, 1);

  await test.step("生徒: 枠は未マッチングに戻り、前回否認理由が出る", async () => {
    await expect(slot).toContainText("未マッチング");
    await expect(slot.getByText(`前回否認理由: ${reason}`)).toBeVisible();
  });

  await test.step("生徒: 同じコーチの同じ枠（金曜 20:00）へ再申請すると、枠は承認待ちになり理由の表示が消える", async () => {
    const coachCard = page.locator("article").filter({ hasText: p.coachName });
    const dialog = page.getByRole("dialog");
    await clickUntilVisible(coachCard.getByRole("button", { name: "カレンダーからリクエストする" }), dialog);
    await dialog.getByRole("button", { name: "金曜日 20:00 申請可能" }).click();
    await expect(dialog).toContainText("毎週 金曜日 20:00 - 20:25");
    await dialog.getByRole("button", { name: "リクエストを送信" }).click();
    await expect(dialog).toHaveCount(0);

    await expect(slot).toContainText("承認待ち");
    await expect(slot.getByRole("button", { name: "リクエストを取り下げる" })).toBeVisible();
    await expect(page.getByText(/前回否認理由/)).toHaveCount(0);

    const { data: requests } = await f.admin
      .from("com_t_matching_request")
      .select("status, coach_id, slot_no, requested_day_of_week, requested_start_time")
      .eq("ticket_id", p.ticketId)
      .order("insert_date");
    expect(requests).toMatchObject([
      { status: 3, coach_id: p.coachId, slot_no: 1 },
      { status: 1, coach_id: p.coachId, slot_no: 1, requested_day_of_week: 5, requested_start_time: "20:00:00" },
    ]);
  });

  await test.step("#7: 承認待ちの枠へもう一度申請すると、一意制約で拒否される", async () => {
    const { error } = await p.studentClient.from("com_t_matching_request").insert({
      ticket_id: p.ticketId, student_id: p.studentId, coach_id: p.coachId, slot_no: 1,
      requested_day_of_week: 5, requested_start_time: "20:00:00", requested_end_time: "20:25:00", requested_timezone: "Asia/Tokyo",
    });
    expect(error?.code).toBe("23505");
  });
});
