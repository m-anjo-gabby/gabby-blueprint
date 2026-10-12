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

  test("参加すると参加URLとカレンダー追加が表示され、詳細から取り消せる", async ({ page }, testInfo) => {
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
    await expect(card.getByRole("link", { name: "入室する" })).toHaveCount(0);
    await expect(card.getByText("参加すると、入室用のリンクが表示されます。")).toBeVisible();

    await card.getByRole("button", { name: "参加する" }).click();
    await expect(card.getByRole("link", { name: "入室する" })).toHaveAttribute("href", locationUrl);
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
    await expect(drawer.getByRole("button", { name: "参加する" })).toBeVisible();

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

  test("シリーズの作成画面でシリーズと回をまとめて登録すると、シリーズに属する参加確認ありの回が登録される", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "アドミンの画面は desktop のみ");
    const admin = await createAdminClient();
    const seriesTitle = `${E2E_EVENT_TITLE_PREFIX}シリーズ アドミン登録 ${Date.now()}`;
    const { context, page } = await openAdminContext(browser);
    try {
      await page.goto("/calendar-events/series");
      await page.getByRole("link", { name: "新規シリーズ" }).click();
      // dev は初回の表示で画面のコンパイルを待つため長めに待つ
      await page.waitForURL(/\/calendar-events\/series\/new$/, { timeout: 60_000 });
      await page.getByLabel("シリーズ名").fill(seriesTitle);
      await page.getByLabel("説明", { exact: true }).fill("E2E のシリーズ説明");
      const rows = page.getByTestId("series-session-row");
      await rows.nth(0).getByLabel("内容（タイトル）").fill("E2E Week 1");
      await page.getByRole("button", { name: "回を追加（1週間後）" }).click();
      await rows.nth(1).getByLabel("内容（タイトル）").fill("E2E Week 2");
      // 参加URLを回ごとに設定する（オンにすると共通の欄が消え、各回に欄が出る）
      await expect(page.getByLabel("参加URL（任意）")).toHaveCount(1);
      await page.getByRole("switch", { name: "回ごとに参加URLを設定する" }).click();
      await expect(rows.nth(0).getByLabel("参加URL（任意）")).toBeVisible();
      await expect(page.getByLabel("参加URL（任意）")).toHaveCount(2);
      await rows.nth(0).getByLabel("参加URL（任意）").fill("https://example.com/e2e-week-1");
      await rows.nth(1).getByLabel("参加URL（任意）").fill("https://example.com/e2e-week-2");
      await page.getByRole("button", { name: "シリーズを作成する（2回）" }).click();

      // 作成後はシリーズの詳細へ移る
      await page.waitForURL(/\/calendar-events\/series\/[0-9a-f-]+$/, { timeout: 60_000 });
      await expect(page.getByRole("heading", { level: 1, name: seriesTitle })).toBeVisible();
      await expect(page.getByRole("cell", { name: "E2E Week 1" })).toBeVisible();
      await expect(page.getByRole("cell", { name: "E2E Week 2" })).toBeVisible();

      // シリーズの回の編集では、シリーズを変えられない（読み取り専用の表示と「シリーズで管理」）
      await page.getByRole("row", { name: /E2E Week 1/ }).getByRole("button", { name: "編集" }).click();
      const editDialog = page.getByRole("dialog");
      await expect(editDialog.getByText(seriesTitle)).toBeVisible();
      await expect(editDialog.getByRole("link", { name: "シリーズで管理" })).toBeVisible();
      // ダイアログは先頭から表示する（担当コーチの選択欄の自動スクロールで下にずれない。CalendarEventCoachPicker）
      expect(await editDialog.locator("form").evaluate((form) => form.scrollTop)).toBe(0);
      await page.keyboard.press("Escape");

      // シリーズの詳細から開いた参加者・アナウンス管理は、シリーズの詳細へ戻る
      const seriesUrl = page.url();
      await page.getByRole("row", { name: /E2E Week 1/ }).getByRole("link", { name: "参加者" }).click();
      await page.waitForURL(/\/participants\?from=series$/, { timeout: 60_000 });
      await page.getByRole("link", { name: `シリーズ「${seriesTitle}」に戻る` }).click();
      await page.waitForURL(seriesUrl, { timeout: 60_000 });

      // 「このシリーズを元に作成」は、各回の時刻を引き継ぎ、元の最後の回の1週間後から同じ間隔で日付を並べる（ここでは作成しない）
      await page.getByRole("link", { name: "このシリーズを元に作成" }).click();
      await page.waitForURL(/\/calendar-events\/series\/new\?from=/, { timeout: 60_000 });
      await expect(page.getByLabel("シリーズ名")).toHaveValue(`${seriesTitle}（コピー）`);
      const copiedRows = page.getByTestId("series-session-row");
      await expect(copiedRows).toHaveCount(2);
      const copiedDates = [
        await copiedRows.nth(0).getByLabel("日付（日本時間）").inputValue(),
        await copiedRows.nth(1).getByLabel("日付（日本時間）").inputValue(),
      ];
      await expect(copiedRows.nth(0).getByLabel("内容（タイトル）")).toHaveValue("");
      // 元の回の参加URLが回ごとに違うため「回ごとに設定」で開き、各回のURLは引き継がない（空欄）
      await expect(page.getByRole("switch", { name: "回ごとに参加URLを設定する" })).toBeChecked();
      await expect(copiedRows.nth(0).getByLabel("参加URL（任意）")).toHaveValue("");

      const { data: series } = await admin.from("com_m_calendar_event_series").select("series_id").eq("title", seriesTitle).single();
      const { data: sessions } = await admin
        .from("com_m_calendar_event")
        .select("title, rsvp_enabled, is_published, start_datetime, location_url")
        .eq("series_id", series!.series_id)
        .order("start_datetime");
      expect(sessions?.map((s) => [s.title, s.rsvp_enabled, s.is_published, s.location_url])).toEqual([
        ["E2E Week 1", true, false, "https://example.com/e2e-week-1"],
        ["E2E Week 2", true, false, "https://example.com/e2e-week-2"],
      ]);
      // 2回目は1回目の1週間後
      const [first, second] = sessions!;
      expect(new Date(second.start_datetime).getTime() - new Date(first.start_datetime).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
      // 元の1回目〜2回目の日付（日本時間）から、コピーは2週間後・3週間後
      const jstDate = (iso: string, addDays: number) =>
        new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000 + addDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      expect(copiedDates).toEqual([jstDate(first.start_datetime, 14), jstDate(first.start_datetime, 21)]);
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
