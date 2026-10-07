import {
  createGroupSession,
  deleteGroupSession,
  joinAsStudent,
  type GroupSessionFixture,
} from "../../support/calendarEventFixtures.ts";
import { PERSONAS, storageStatePath } from "../../support/personas.ts";
import { expect, test } from "../../support/studentApp.ts";

/**
 * グループセッションの一覧（/group-sessions。入口は docs/screens/student/dashboard.md「グループセッション」）。
 * シリーズごとのカード・すべての回に参加する・参加登録した過去のセッションを確かめる。
 * 参加登録は状態を変えるため、使い捨てのシリーズ・回（所属テナント限定の配信）を作って desktop でだけ検証する。
 */

test.use({ storageState: storageStatePath("monitorStudent") });

const DAY_MINUTES = 24 * 60;
let fixtures: GroupSessionFixture[] = [];

test.afterEach(async () => {
  for (const fixture of fixtures) await deleteGroupSession(fixture);
  fixtures = [];
});

test("シリーズの回を一覧し、すべての回に参加できる。参加登録した過去の回は「過去のセッション」に出る", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "参加登録の状態を変えるため desktop のみ");
  const email = PERSONAS.monitorStudent.email;
  const first = await createGroupSession(email, { startOffsetMinutes: 2 * DAY_MINUTES, label: "一覧 1回目", withSeries: true });
  fixtures.push(first);
  const second = await createGroupSession(email, { startOffsetMinutes: 9 * DAY_MINUTES, label: "一覧 2回目", seriesId: first.seriesId! });
  fixtures.push(second);
  const past = await createGroupSession(email, { startOffsetMinutes: -3 * DAY_MINUTES, label: "一覧 過去", seriesId: first.seriesId! });
  fixtures.push(past);
  await joinAsStudent(past, email);

  // ホームのカードの「一覧を見る」から開く
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "一覧を見る" }).click();
  // dev は新しい画面の初回表示でコンパイルを待つため、遷移は長めに待つ（KJ-2026-1005-02）
  await page.waitForURL(/\/group-sessions$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "グループセッション" })).toBeVisible();

  const seriesCard = page.getByRole("region", { name: first.seriesTitle! });
  await expect(seriesCard.getByText("E2E で作成したシリーズの説明です。")).toBeVisible();
  await expect(seriesCard.getByTestId("group-session-row")).toHaveCount(2);
  await expect(seriesCard.getByText(first.title)).toBeVisible();
  await expect(seriesCard.getByText(second.title)).toBeVisible();
  // 終了した回は「これから」には出さない
  await expect(seriesCard.getByText(past.title)).toHaveCount(0);

  await seriesCard.getByRole("button", { name: "すべての回に参加する（2回）" }).click();
  await expect(seriesCard.getByText("すべての回が参加予定です")).toBeVisible();
  await expect(seriesCard.getByRole("link", { name: "入室する" })).toHaveCount(2);

  const { count } = await first.admin
    .from("com_t_calendar_event_participant")
    .select("*", { count: "exact", head: true })
    .in("calendar_event_id", [first.calendarEventId, second.calendarEventId]);
  expect(count).toBe(2);

  await page.getByRole("tab", { name: "過去のセッション" }).click();
  await expect(page).toHaveURL(/\/group-sessions\?tab=past$/);
  const pastList = page.getByRole("region", { name: "過去のセッション" });
  await expect(pastList.getByText(past.title)).toBeVisible();
  await expect(pastList.getByText(first.title)).toHaveCount(0);
});

test("イベントの詳細の「このシリーズの回をすべて見る」でシリーズの位置を開く", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てのイベントを作るため desktop のみ");
  const fixture = await createGroupSession(PERSONAS.monitorStudent.email, { startOffsetMinutes: 10, label: "詳細からの導線", withSeries: true });
  fixtures.push(fixture);

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "詳細" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "このシリーズの回をすべて見る" }).click();
  await page.waitForURL(new RegExp(`/group-sessions\\?series=${fixture.seriesId}$`), { timeout: 60_000 });
  await expect(page.getByRole("region", { name: fixture.seriesTitle! })).toBeVisible();
});

test("一覧は全プロジェクトで表示崩れなく開ける（閲覧のみ）", async ({ page }) => {
  await page.goto("/group-sessions");
  await expect(page.getByRole("heading", { level: 1, name: "グループセッション" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "これから" })).toHaveAttribute("data-state", "active");
});
