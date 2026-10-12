import { expect, test, type Page } from "@playwright/test";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableCoach,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { confirmModal, openCoachContext } from "../../support/coachApp.ts";
import { clickUntilVisible } from "../../support/hydration.ts";

/**
 * コーチの空き時間の設定（画面: docs/screens/coach/availability.md、機能: e2e/specs/matching/coach-matching.md 手順1・5）。
 * 使い捨てのコーチ（日本時間・空き時間なし）で、現地時刻のマスを選んで保存すると UTC で登録され、確認日時が更新されること、
 * 「No changes needed」で確認日時だけが更新されること、マスを外して保存すると確認のうえ削除されることを確かめる。
 * coach は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = "Availability2026a";

let fixture: AuthFixture | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、coach は PC 表示の別コンテキストで開くため desktop だけで実行する");
});

test.afterEach(async () => {
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

const cell = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });

test("現地時刻で選んだ枠が UTC で保存され、確認・削除もできる", async ({ browser }) => {
  const f = await createAuthFixture("coachavail");
  fixture = f;
  const email = `${f.tag}-coach@${DISPOSABLE_EMAIL_DOMAIN}`;
  const coachId = await createDisposableCoach(f, { email, password: PASSWORD, userName: `E2E Coach ${f.tag}`, timezone: "Asia/Tokyo", availability: [] });

  const slots = async () => {
    const { data } = await f.admin
      .from("com_m_coach_availability").select("day_of_week, start_time, end_time").eq("coach_id", coachId).eq("delete_flg", "0");
    return data ?? [];
  };
  const confirmedAt = async () => {
    const { data } = await f.admin.from("com_m_coach_profile").select("availability_confirmed_at").eq("user_id", coachId).single();
    return data?.availability_confirmed_at as string | null;
  };

  const { context, page } = await openCoachContext(browser, { email, password: PASSWORD });
  try {
    await page.goto("/availability");
    await expect(page.getByRole("heading", { level: 1, name: "Weekly Availability" })).toBeVisible();
    await expect(page.getByText("You have no availability yet.")).toBeVisible();
    const save = page.getByRole("button", { name: "Save Changes" });
    await expect(save).toBeDisabled();

    await test.step("金曜 19:00〜20:00（日本時間）を選んで保存すると、UTC の金曜 10:00〜11:00 で登録される", async () => {
      // 最初のマスはハイドレーション前の押下に備えて、選ばれたことを確かめて押し直す
      await clickUntilVisible(cell(page, "Fri 19:00"), page.locator('[aria-label="Fri 19:00"][aria-pressed="true"]'));
      await cell(page, "Fri 19:30").click();
      await expect(cell(page, "Fri 19:30")).toHaveAttribute("aria-pressed", "true");
      await save.click();
      await expect(page.getByText("Availability updated")).toBeVisible();
      await expect(save).toBeDisabled();

      expect(await slots()).toEqual([{ day_of_week: 5, start_time: "10:00:00", end_time: "11:00:00" }]);
      expect(await confirmedAt()).not.toBeNull();
    });

    await test.step("「No changes needed」で、空き時間は変えずに確認日時だけを更新する", async () => {
      const before = await confirmedAt();
      await page.getByRole("button", { name: "No changes needed" }).click();
      await expect(page.getByText("Thanks! Your availability is confirmed.")).toBeVisible();
      await expect.poll(confirmedAt).not.toBe(before);
      expect(await slots()).toHaveLength(1);
    });

    await test.step("マスを外して保存すると、確認のうえ削除される", async () => {
      await cell(page, "Fri 19:00").click();
      await cell(page, "Fri 19:30").click();
      const modal = confirmModal(page);
      await clickUntilVisible(save, modal);
      await expect(modal).toContainText("Save changes?");
      await modal.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Availability updated")).toBeVisible();
      await expect(page.getByText("You have no availability yet.")).toBeVisible();
      expect(await slots()).toEqual([]);
    });
  } finally {
    await context.close();
  }
});
