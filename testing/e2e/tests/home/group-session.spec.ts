import type { Page } from "@playwright/test";
import { createAdminClient } from "../../../helpers/auth.ts";
import { openAdminContext } from "../../support/adminApp.ts";
import {
  createGroupSession,
  deleteGroupSession,
  E2E_EVENT_TITLE_PREFIX,
  type GroupSessionFixture,
} from "../../support/calendarEventFixtures.ts";
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
    fixture = await createGroupSession(PERSONAS.monitorStudent.email, {
      startOffsetMinutes: 10,
      label: "ホーム参加登録",
      withSeries: true,
      coachEmail: "qa-coach-us-01@gabby-qa-test.example",
    });
    const { title, locationUrl, admin, calendarEventId, seriesTitle, coachName } = fixture;

    await page.goto("/dashboard");
    const card = groupSessionCard(page);
    await expect(card.getByText(title)).toBeVisible();
    // シリーズ名と担当コーチ名を各回のタイトルに添える
    await expect(card.getByText(seriesTitle!)).toBeVisible();
    if (coachName) await expect(card.getByText(`コーチ：${coachName}`)).toBeVisible();
    // 参加登録の前は参加URLを出さない
    await expect(card.getByRole("link", { name: "参加する" })).toHaveCount(0);
    await expect(card.getByText("参加予定にすると、参加用のリンクが表示されます。")).toBeVisible();

    await card.getByRole("button", { name: "参加予定にする" }).click();
    await expect(card.getByRole("link", { name: "参加する" })).toHaveAttribute("href", locationUrl);
    await expect(card.getByRole("button", { name: "お使いのカレンダーに追加" })).toBeVisible();
    await expect(card.getByText("参加予定", { exact: true })).toBeVisible();

    const { count: joined } = await admin
      .from("com_t_calendar_event_participant")
      .select("*", { count: "exact", head: true })
      .eq("calendar_event_id", calendarEventId);
    expect(joined).toBe(1);

    // 詳細（カレンダーと同じイベントの詳細）から参加を取り消す
    await card.getByRole("button", { name: "詳細" }).click();
    const drawer = page.getByRole("dialog").filter({ hasText: title });
    // 詳細にはシリーズの説明も出す
    await expect(drawer.getByText("E2E で作成したシリーズの説明です。")).toBeVisible();
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

  test("シリーズを作り、回をまとめて追加すると、シリーズに属する参加確認ありの回が登録される", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "アドミンの画面は desktop のみ");
    const admin = await createAdminClient();
    const seriesTitle = `${E2E_EVENT_TITLE_PREFIX}シリーズ アドミン登録 ${Date.now()}`;
    const { context, page } = await openAdminContext(browser);
    try {
      await page.goto("/calendar-events/series");
      await page.getByRole("button", { name: "新規シリーズ" }).click();
      const seriesDialog = page.getByRole("dialog");
      await seriesDialog.getByLabel("シリーズ名").fill(seriesTitle);
      await seriesDialog.getByLabel("説明").fill("E2E のシリーズ説明");
      await seriesDialog.getByRole("button", { name: "作成する" }).click();

      // 作成後はシリーズの詳細へ移る（dev は初回の表示で画面のコンパイルを待つため長めに待つ）
      await page.waitForURL(/\/calendar-events\/series\/[0-9a-f-]+$/, { timeout: 60_000 });
      await expect(page.getByRole("heading", { level: 1, name: seriesTitle })).toBeVisible();
      await page.getByRole("button", { name: "回をまとめて追加" }).click();
      const addDialog = page.getByRole("dialog");
      const rows = addDialog.getByTestId("series-session-row");
      await rows.nth(0).getByLabel("内容（タイトル）").fill("E2E Week 1");
      await addDialog.getByRole("button", { name: "回を追加（1週間後）" }).click();
      await rows.nth(1).getByLabel("内容（タイトル）").fill("E2E Week 2");
      await addDialog.getByRole("button", { name: "2件を登録する" }).click();

      await expect(page.getByRole("cell", { name: "E2E Week 1" })).toBeVisible();
      await expect(page.getByRole("cell", { name: "E2E Week 2" })).toBeVisible();

      // シリーズの回の編集では、シリーズを変えられない（読み取り専用の表示と「シリーズで管理」）
      await page.getByRole("row", { name: /E2E Week 1/ }).getByRole("button", { name: "編集" }).click();
      const editDialog = page.getByRole("dialog");
      await expect(editDialog.getByText(seriesTitle)).toBeVisible();
      await expect(editDialog.getByRole("link", { name: "シリーズで管理" })).toBeVisible();
      await page.keyboard.press("Escape");

      const { data: series } = await admin.from("com_m_calendar_event_series").select("series_id").eq("title", seriesTitle).single();
      const { data: sessions } = await admin
        .from("com_m_calendar_event")
        .select("title, rsvp_enabled, is_published, start_datetime")
        .eq("series_id", series!.series_id)
        .order("start_datetime");
      expect(sessions?.map((s) => [s.title, s.rsvp_enabled, s.is_published])).toEqual([
        ["E2E Week 1", true, false],
        ["E2E Week 2", true, false],
      ]);
      // 2回目は1回目の1週間後
      const [first, second] = sessions!;
      expect(new Date(second.start_datetime).getTime() - new Date(first.start_datetime).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    } finally {
      await context.close();
      // 登録した回（下書きのため生徒には表示されない）とシリーズを削除する
      const { data: series } = await admin.from("com_m_calendar_event_series").select("series_id").eq("title", seriesTitle).maybeSingle();
      if (series) {
        await admin.from("com_m_calendar_event").delete().eq("series_id", series.series_id);
        await admin.from("com_m_calendar_event_series").delete().eq("series_id", series.series_id);
      }
    }
  });
});
