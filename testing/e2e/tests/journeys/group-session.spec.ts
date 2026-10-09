import type { Page } from "@playwright/test";
import {
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableCoach,
  createDisposableStudent,
  DISPOSABLE_EMAIL_DOMAIN,
  grantAppLicense,
  type AuthFixture,
} from "../../support/authFixtures.ts";
import { openAdminContext, openDialogBy } from "../../support/adminApp.ts";
import { openCoachContext } from "../../support/coachApp.ts";
import { clickUntilVisible } from "../../support/hydration.ts";
import { jstDateOf } from "../../support/liveRoomView.ts";
import { cronSecret, invokeMailDispatch } from "../../support/mailDispatch.ts";
import { resendReadApiKey, resendTestAddress, waitForEmail } from "../../support/resendInbox.ts";
import { expect, loginAsNewStudent, test } from "../../support/studentApp.ts";

/**
 * グループセッション（ジャーニー: e2e/journeys/group-session.md）
 *
 * アドミンが使い捨ての顧客向けにシリーズ（2回。1回目は約50分後に開始、担当コーチつき）を画面から作り、
 * 生徒（アプリのみ契約）がホームと一覧からすべての回に参加 → アドミンが参加者を確かめてアナウンスを送り、生徒・担当コーチに届く →
 * 1時間前のリマインダーメールが届く → 生徒が2回目の参加を取り消す → 1回目の終了後は「過去のセッション」に移る、までを確かめる。
 * - リマインダーは pg_cron の代わりに送信処理（admin の /api/cron/mail-dispatch）を呼び、Resend のテスト用アドレスで受け取る。
 * - 1回目の終了は待てないため、最後に開始・終了を過去へずらす。
 * - admin・coach は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

const PASSWORD = "GroupSession2026a";
const MINUTE_MS = 60 * 1000;

let fixture: AuthFixture | undefined;
let seriesId: string | undefined;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作り、admin・coach は PC 表示の別コンテキストで開くため desktop だけで実行する");
  test.skip(!resendReadApiKey() || !cronSecret(), "RESEND_TEST_READ_API_KEY または CRON_SECRET が未設定");
});

test.afterEach(async () => {
  if (fixture && seriesId) {
    // 画面から作ったシリーズの回（参加登録・担当コーチ・アナウンスは回の削除で消える）と、その送信待ち・シリーズを消す
    const { data: events } = await fixture.admin.from("com_m_calendar_event").select("calendar_event_id").eq("series_id", seriesId);
    for (const { calendar_event_id: id } of events ?? []) {
      await fixture.admin.from("com_t_mail_outbox").delete().like("dedup_key", `${id}:%`);
    }
    await fixture.admin.from("com_m_calendar_event").delete().eq("series_id", seriesId);
    await fixture.admin.from("com_m_calendar_event_series").delete().eq("series_id", seriesId);
  }
  seriesId = undefined;
  await cleanupAuthFixture(fixture);
  fixture = undefined;
});

/** 日本時間の日付（YYYY-MM-DD）と時刻（HH:MM） */
function jstParts(at: Date): { date: string; time: string } {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(at);
  return { date: jstDateOf(at.toISOString()), time };
}

const homeGroupSessionCard = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: "グループセッション" }) });

test("アドミンが企画したシリーズに生徒が参加し、アナウンス・リマインダーを受け取り、終了後は過去のセッションに残る", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const f = await createAuthFixture("groupsession");
  fixture = f;
  const clientName = `【QAテスト】認証E2E（${f.tag}）`;

  const studentEmail = resendTestAddress(`${f.tag}-group`);
  const studentName = `E2Eグループ ${f.tag}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password: PASSWORD, userName: studentName });
  await grantAppLicense(f, studentId);
  const coach = { email: `${f.tag}-coach@${DISPOSABLE_EMAIL_DOMAIN}`, name: `E2E Group Coach ${f.tag}` };
  await createDisposableCoach(f, { email: coach.email, password: PASSWORD, userName: coach.name, timezone: "Asia/Tokyo", availability: [] });

  const seriesTitle = `【E2E】発音グループセッション ${f.tag}`;
  const week1Title = `Week 1: Final /n/ (${f.tag})`;
  const week2Title = `Week 2: Linking (${f.tag})`;
  const locationUrl = `https://example.com/e2e-group-journey/${f.tag}`;
  // 1回目は約50分後（5分単位に切り上げ）。1時間前のリマインダーの期限内
  const week1Start = new Date(Math.ceil((Date.now() + 50 * MINUTE_MS) / (5 * MINUTE_MS)) * 5 * MINUTE_MS);
  const week1 = jstParts(week1Start);
  const announcement = { title: `開始前のご案内（${f.tag}）`, body: "当日はイヤホンをご用意ください。" };
  let week1Id = "";

  const { context: adminContext, page: admin } = await openAdminContext(browser);
  try {
    await test.step("1. アドミン: 顧客を指定して、担当コーチつきの2回のシリーズを公開で作る", async () => {
      await admin.goto("/calendar-events/series/new");
      // dev は初回の表示で画面のコンパイルを待つため長めに待つ
      await expect(admin.getByLabel("シリーズ名")).toBeVisible({ timeout: 60_000 });
      await admin.getByLabel("シリーズ名").fill(seriesTitle);
      await admin.getByLabel("説明", { exact: true }).fill("語尾の発音を4週間で練習する企画です。");

      await admin.getByRole("combobox", { name: "配信対象" }).click();
      await admin.getByRole("option", { name: "顧客指定" }).click();
      await admin.getByRole("combobox", { name: "対象顧客" }).click();
      await admin.getByRole("option", { name: clientName }).click();
      await admin.getByLabel("参加URL（任意）").fill(locationUrl);
      await admin.getByRole("switch", { name: "公開する" }).click();
      await expect(admin.getByRole("switch", { name: "公開する" })).toBeChecked();

      const rows = admin.getByTestId("series-session-row");
      await rows.nth(0).getByLabel("日付（日本時間）").fill(week1.date);
      await rows.nth(0).getByLabel("開始時刻").fill(week1.time);
      await rows.nth(0).getByLabel("終了時刻（任意）").fill("");
      await rows.nth(0).getByLabel("内容（タイトル）").fill(week1Title);
      await rows.nth(0).getByPlaceholder("コーチ名で検索...").fill(coach.name);
      await rows.nth(0).getByRole("option", { name: coach.name }).click();
      await expect(rows.nth(0).getByRole("button", { name: `${coach.name}を削除` })).toBeVisible();
      await admin.getByRole("button", { name: "回を追加（1週間後）" }).click();
      await rows.nth(1).getByLabel("内容（タイトル）").fill(week2Title);
      await admin.getByRole("button", { name: "シリーズを作成する（2回）" }).click();

      await admin.waitForURL(/\/calendar-events\/series\/[0-9a-f-]+$/, { timeout: 60_000 });
      await expect(admin.getByRole("heading", { level: 1, name: seriesTitle })).toBeVisible();
      seriesId = admin.url().split("/").pop();
      const { data: events } = await f.admin
        .from("com_m_calendar_event").select("calendar_event_id, title, rsvp_enabled, is_published, target_type, client_id, start_datetime")
        .eq("series_id", seriesId!).order("start_datetime");
      expect(events?.map((e) => e.title)).toEqual([week1Title, week2Title]);
      for (const e of events!) expect(e).toMatchObject({ rsvp_enabled: true, is_published: true, target_type: "CLIENT", client_id: f.clientId });
      expect(new Date(events![0].start_datetime).getTime()).toBe(week1Start.getTime());
      week1Id = events![0].calendar_event_id as string;
    });

    await test.step("2. 生徒: ホームに次の回が出て、一覧からシリーズのすべての回に参加する", async () => {
      await loginAsNewStudent(page, studentEmail, PASSWORD);
      await page.goto("/dashboard");
      const card = homeGroupSessionCard(page);
      await expect(card.getByText(week1Title)).toBeVisible();
      await expect(card.getByText(seriesTitle).first()).toBeVisible();
      await expect(card.getByText(`コーチ：${coach.name}`)).toBeVisible();
      await expect(card.getByText("参加すると、入室用のリンクが表示されます。")).toBeVisible();

      await card.getByRole("link", { name: "一覧を見る" }).click();
      await page.waitForURL(/\/group-sessions$/, { timeout: 60_000 });
      const seriesCard = page.getByRole("region", { name: seriesTitle });
      await expect(seriesCard.getByTestId("group-session-row")).toHaveCount(2);
      await seriesCard.getByRole("button", { name: "すべての回に参加する（2回）" }).click();
      await expect(seriesCard.getByText("すべての回が参加予定です")).toBeVisible();
      const enter = seriesCard.getByRole("link", { name: "入室する" });
      await expect(enter).toHaveCount(2);
      await expect(enter.first()).toHaveAttribute("href", locationUrl);
    });

    await test.step("3. アドミン: 1回目の参加者に生徒が出て、参加者・担当コーチへアナウンスを送る", async () => {
      await admin.getByRole("row").filter({ hasText: week1Title }).getByRole("link", { name: "参加者" }).click();
      await admin.waitForURL(new RegExp(`/calendar-events/${week1Id}/participants`), { timeout: 60_000 });
      await expect(admin.getByRole("main")).toContainText(studentName);

      await admin.getByRole("tab", { name: "アナウンス" }).click();
      const dialog = await openDialogBy(admin, admin.getByRole("button", { name: "アナウンスを送信" }));
      await dialog.getByPlaceholder("例: 開始時刻の変更について").fill(announcement.title);
      await dialog.getByPlaceholder("参加者・担当コーチへ伝える内容を入力してください").fill(announcement.body);
      await dialog.getByRole("button", { name: "送信する" }).click();
      await expect(admin.getByText("アナウンスを送信しました")).toBeVisible();
      await expect(dialog).toHaveCount(0);
    });
  } finally {
    await adminContext.close();
  }

  await test.step("4. 生徒: ホームの詳細にアナウンスが出る", async () => {
    await page.goto("/dashboard");
    const card = homeGroupSessionCard(page);
    await expect(card.getByText("参加予定", { exact: true }).first()).toBeVisible();
    const drawer = page.getByRole("dialog").filter({ hasText: week1Title });
    await clickUntilVisible(card.getByRole("button", { name: "詳細" }).first(), drawer);
    await expect(drawer).toContainText(announcement.title);
    await expect(drawer).toContainText(announcement.body);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });

  await test.step("5. 担当コーチ: カレンダーに1回目が出る", async () => {
    const { context: coachContext, page: coachPage } = await openCoachContext(browser, { email: coach.email, password: PASSWORD });
    try {
      await coachPage.goto("/calendar");
      await expect(coachPage.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
      await expect(coachPage.getByRole("main")).toContainText(week1Title);
    } finally {
      await coachContext.close();
    }
  });

  await test.step("6. システム: 1回目の1時間前のリマインダーメールが生徒に届く", async () => {
    const since = new Date();
    const response = await invokeMailDispatch();
    expect(response.status()).toBe(200);
    const { data: rows } = await f.admin.from("com_t_mail_outbox").select("dedup_key, status").eq("user_id", studentId).like("dedup_key", `${week1Id}:%`);
    expect(rows).toEqual([{ dedup_key: `${week1Id}:1h`, status: "SENT" }]);
    const mail = await waitForEmail({ to: studentEmail, since, subject: /まもなくグループセッションが始まります/ });
    expect(mail.html).toContain(week1Title);
    expect(mail.html).toContain(locationUrl);
  });

  await test.step("7. 生徒: 都合が悪くなった2回目の参加を、一覧の詳細から取り消す", async () => {
    await page.goto("/group-sessions");
    const row = page.getByRole("region", { name: seriesTitle }).getByTestId("group-session-row").filter({ hasText: week2Title });
    const drawer = page.getByRole("dialog").filter({ hasText: week2Title });
    await clickUntilVisible(row.getByRole("button", { name: /詳細/ }), drawer);
    await drawer.getByRole("button", { name: "キャンセル" }).click();
    await page.getByRole("button", { name: "OK" }).click();
    await expect(drawer.getByRole("button", { name: "参加する" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(row.getByRole("button", { name: "参加する" })).toBeVisible();
    const { data: joined } = await f.admin.from("com_t_calendar_event_participant").select("calendar_event_id").eq("user_id", studentId);
    expect(joined?.map((r) => r.calendar_event_id)).toEqual([week1Id]);
  });

  await test.step("8. 生徒: 1回目の終了後は「過去のセッション」に移り、「これから」には2回目だけが残る", async () => {
    // 終了は待てないため、1回目を3時間前〜2時間前に移す
    const pastStart = Date.now() - 3 * 60 * MINUTE_MS;
    const { error } = await f.admin
      .from("com_m_calendar_event")
      .update({ start_datetime: new Date(pastStart).toISOString(), end_datetime: new Date(pastStart + 60 * MINUTE_MS).toISOString() })
      .eq("calendar_event_id", week1Id);
    if (error) throw new Error(`1回目を過去へ移せませんでした: ${error.message}`);

    await page.goto("/group-sessions");
    const rows = page.getByRole("region", { name: seriesTitle }).getByTestId("group-session-row");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(week2Title);
    await expect(rows.getByRole("button", { name: "参加する" })).toBeVisible();

    await page.getByRole("tab", { name: "過去のセッション" }).click();
    const pastList = page.getByRole("region", { name: "過去のセッション" });
    await expect(pastList).toContainText(week1Title);
    await expect(pastList).not.toContainText(week2Title);
  });
});
