import type { Page } from "@playwright/test";
import { openAdminContext } from "../../support/adminApp.ts";
import { createGroupSession, deleteGroupSession, type GroupSessionFixture } from "../../support/calendarEventFixtures.ts";
import { PERSONAS, storageStatePath } from "../../support/personas.ts";
import { expect, test } from "../../support/studentApp.ts";

/**
 * ホームのグループセッション（docs/screens/student/dashboard.md「グループセッション」）。
 * 全プランの生徒に表示し、参加登録した生徒にだけ参加URLを出す。
 * 参加登録は状態を変えるため、使い捨てのイベント（所属テナント限定の配信）を作って desktop でだけ検証する。
 */

const groupSessionCard = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: "グループセッション" }) });

test.describe("アプリのみ契約の生徒", () => {
  test.use({ storageState: storageStatePath("monitorStudent") });

  let fixture: GroupSessionFixture | null = null;

  test.afterEach(async () => {
    if (fixture) await deleteGroupSession(fixture);
    fixture = null;
  });

  test("参加予定にすると参加URLとカレンダー追加が表示され、詳細から取り消せる", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "参加登録の状態を変えるため desktop のみ");
    // 所属テナントの既存の予定より先に表示されるよう、すぐ後に始まる予定にする
    fixture = await createGroupSession(PERSONAS.monitorStudent.email, { startOffsetMinutes: 10, label: "ホーム参加登録" });
    const { title, locationUrl, admin, calendarEventId } = fixture;

    await page.goto("/dashboard");
    const card = groupSessionCard(page);
    await expect(card.getByText(title)).toBeVisible();
    // 参加登録の前は参加URLを出さない
    await expect(card.getByRole("link", { name: "参加する" })).toHaveCount(0);
    await expect(card.getByText("参加予定にすると、参加用のリンクが表示されます。")).toBeVisible();

    await card.getByRole("button", { name: "参加予定にする" }).click();
    await expect(card.getByRole("link", { name: "参加する" })).toHaveAttribute("href", locationUrl);
    await expect(card.getByRole("button", { name: "カレンダーに追加" })).toBeVisible();
    await expect(card.getByText("参加予定", { exact: true })).toBeVisible();

    const { count: joined } = await admin
      .from("com_t_calendar_event_participant")
      .select("*", { count: "exact", head: true })
      .eq("calendar_event_id", calendarEventId);
    expect(joined).toBe(1);

    // 詳細（カレンダーと同じイベントの詳細）から参加を取り消す
    await card.getByRole("button", { name: "詳細" }).click();
    const drawer = page.getByRole("dialog").filter({ hasText: title });
    await drawer.getByRole("button", { name: "キャンセル" }).click();
    await page.getByRole("button", { name: "OK" }).click();
    await expect(drawer.getByRole("button", { name: "参加予定にする" })).toBeVisible();

    const { count: afterCancel } = await admin
      .from("com_t_calendar_event_participant")
      .select("*", { count: "exact", head: true })
      .eq("calendar_event_id", calendarEventId);
    expect(afterCancel).toBe(0);
  });
});

test.describe("ライブセッション契約の生徒", () => {
  test.use({ storageState: storageStatePath("liveStudent") });

  test("ライブセッションと並んでグループセッションの区画が表示される", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 2, name: "ライブセッション" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "グループセッション" })).toBeVisible();
  });
});

test.describe("アドミンのイベント登録", () => {
  test("グループセッションは参加確認が必須で、ほかの種別では切り替えられる", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "アドミンの画面は desktop のみ");
    const { context, page } = await openAdminContext(browser);
    try {
      await page.goto("/calendar-events");
      await page.getByRole("button", { name: "新規登録" }).click();
      const dialog = page.getByRole("dialog");
      const rsvp = dialog.getByRole("switch", { name: "参加確認を有効にする" });
      await expect(rsvp).toBeChecked();
      await expect(rsvp).toBeDisabled();

      await dialog.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "メンテナンス" }).click();
      await expect(rsvp).toBeEnabled();
    } finally {
      await context.close();
    }
  });
});
