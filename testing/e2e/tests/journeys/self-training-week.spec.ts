import type { Page } from "@playwright/test";
import { test, expect, loginAsNewStudent } from "../../support/studentApp.ts";
import { storageStatePath, type PersonaKey } from "../../support/personas.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  grantAppLicense,
  prepareWordContent,
  type AuthFixture,
} from "../../support/authFixtures.ts";

/**
 * 自主トレーニングの継続（ジャーニー: e2e/journeys/self-training-week.md）
 *
 * - 操作を通すもの（使い捨てのアプリのみ契約の生徒、desktop のみ）: 単語帳の中断と再開（ステップ3〜4）、
 *   スプリントの設定画面で選べるレベル（ステップ6）。
 * - 見え方（利用者ペルソナ P01・P03、閲覧のみ）: ホーム・トレーニング記録・各履歴（ステップ1・9・11）。
 *   ペルソナの学習履歴は投入日の前日までのため、件数・値は判定せず、表示が崩れないことだけを確かめる（CONVENTIONS.md 3章）。
 * - トレーニングの実施・記録の反映は音声の入出力が必要なため対象外。
 */

const PASSWORD = "SelfTrain2026a";

test.describe("使い捨てのアプリのみ契約の生徒", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let fixture: AuthFixture | undefined;

  test.afterEach(async () => {
    if (fixture) {
      await fixture.admin.from("com_t_resume_contents").delete().in("user_id", fixture.userIds);
      await fixture.admin.from("com_m_contents_access").delete().eq("client_id", fixture.clientId);
    }
    await cleanupAuthFixture(fixture);
    fixture = undefined;
  });

  /** 使い捨ての生徒（アプリのみ契約）を作り、ログインして規約に同意する */
  async function startAsNewStudent(page: Page, prefix: string): Promise<{ f: AuthFixture; userId: string }> {
    const f = await createAuthFixture(prefix);
    fixture = f;
    const email = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
    const userId = await createDisposableStudent(f, { email, password: PASSWORD });
    await grantAppLicense(f, userId);
    await loginAsNewStudent(page, email, PASSWORD);
    return { f, userId };
  }

  /** ホームの「今日やること」の見出し（続きから／今日のトレーニング） */
  const todayFocus = (page: Page, eyebrow: "続きから" | "今日のトレーニング") =>
    page.locator("section").filter({ has: page.getByText(eyebrow, { exact: true }) }).first();

  /** 単語帳を1つ進めてからブックマークして終える（ホームへ戻る） */
  async function bookmarkWord(page: Page, contentId: string): Promise<void> {
    await page.goto(`/training/word/${contentId}`);
    const next = page.getByRole("button", { name: "Next" });
    await expect(next).toBeEnabled({ timeout: 30_000 });
    await next.click();
    const bookmark = page.getByRole("button", { name: "ブックマークして終了" });
    await expect(bookmark).toBeEnabled();
    await bookmark.click();
    await page.getByRole("button", { name: "OK" }).click();
    await page.waitForURL("**/dashboard");
  }

  test("単語帳をブックマークして終えると、ホームの続きから再開でき、再開すると続きからが消える（ステップ3〜4）", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
    test.setTimeout(120_000);

    const { f } = await startAsNewStudent(page, "selftr");
    const word = await prepareWordContent(f);

    await expect(todayFocus(page, "今日のトレーニング")).toBeVisible();

    await test.step("ブックマークして終えると、今日やることが「続きから」になる", async () => {
      await bookmarkWord(page, word.content_id);
      const focus = todayFocus(page, "続きから");
      await expect(focus).toBeVisible();
      await expect(focus.getByText(word.content_name)).toBeVisible();
      await expect(focus.getByText("単語帳・前回の続きから再開できます")).toBeVisible();
    });

    await test.step("続きから再開すると保存した位置から始まり、再開情報は消える", async () => {
      await todayFocus(page, "続きから").getByRole("link", { name: "続きから再開" }).click();
      await page.waitForURL(`**/training/word/${word.content_id}**`);
      await expect(page.getByText("続きから再開しました")).toBeVisible({ timeout: 30_000 });

      await page.goto("/dashboard");
      await expect(todayFocus(page, "今日のトレーニング")).toBeVisible();
      await expect(page.getByRole("link", { name: "続きから再開" })).toHaveCount(0);
    });

    await test.step("ブックマークはホームから削除できる", async () => {
      await bookmarkWord(page, word.content_id);
      await todayFocus(page, "続きから").getByRole("button", { name: "ブックマークを削除" }).click();
      await page.getByRole("button", { name: "OK" }).click();
      await expect(page.getByText("再開情報を削除しました")).toBeVisible();
      await expect(todayFocus(page, "今日のトレーニング")).toBeVisible();
    });
  });

  test("スプリントの設定画面では、アプリのみ契約は問題のある全レベルを選べる（ステップ6）", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
    test.setTimeout(120_000);

    const { f, userId } = await startAsNewStudent(page, "selflv");
    // 汎用スプリント（限定公開）を使い捨ての顧客に公開する（後始末で消す）
    const { data: sprint, error } = await f.admin
      .from("com_m_contents")
      .select("content_id")
      .eq("content_type", 2)
      .eq("content_scope", 1)
      .eq("metadata->sprint->>sprint_type", "0")
      .limit(1)
      .single();
    if (error || !sprint) throw new Error(`汎用スプリントが見つかりません: ${error?.message}`);
    const { error: accessError } = await f.admin.from("com_m_contents_access").insert({ client_id: f.clientId, content_id: sprint.content_id });
    if (accessError) throw new Error(`教材の公開先の追加に失敗しました: ${accessError.message}`);

    // UG Speed（種別0）で問題があるレベル
    const { data: available, error: levelError } = await f.admin.rpc("get_sprint_available_levels", { p_content_ids: [sprint.content_id] });
    if (levelError) throw new Error(`問題のあるレベルの取得に失敗しました: ${levelError.message}`);
    const levels = (available as { question_type: string; difficulty_level: number }[])
      .filter((r) => r.question_type === "0")
      .map((r) => r.difficulty_level)
      .sort((a, b) => a - b);
    expect(levels.length, "汎用スプリントの UG Speed に Lv2 以上の問題が必要").toBeGreaterThan(2);
    const levelButton = (dialog: ReturnType<Page["getByRole"]>, level: number) =>
      dialog.getByRole("button", { name: level === 0 ? "Basic" : `Lv ${level}`, exact: true });

    const openLevelDrawer = async () => {
      await page.goto(`/training/sprint/play?mode=sprint&type=0&content_id=${sprint.content_id}&sprint_type=0`);
      await page.getByRole("button", { name: "種別・レベル・時間を変更" }).click();
      const drawer = page.getByRole("dialog");
      await expect(drawer.getByText("レベルの選択")).toBeVisible();
      return drawer;
    };

    await test.step("レベル管理オフ（アプリのみ契約）: 問題のある全レベルが選べる", async () => {
      const drawer = await openLevelDrawer();
      for (const level of levels) {
        await expect(levelButton(drawer, level)).toBeEnabled();
      }
    });

    await test.step("比較: レベル管理オン（ライブ付き契約の運用）では到達レベル0の次（Lv1）までに限られる", async () => {
      await f.admin.from("student_m_sprint_progress").update({ level_managed: true }).eq("user_id", userId);
      const drawer = await openLevelDrawer();
      await expect(levelButton(drawer, 1)).toBeEnabled();
      await expect(levelButton(drawer, levels[levels.length - 1])).toBeDisabled();
    });
  });
});

/** 利用者ペルソナの見え方（閲覧のみ。値は判定しない） */
const LEARNERS: { key: PersonaKey; label: string }[] = [
  { key: "dailyLearner", label: "P01（毎日学習）" },
  { key: "weekendLearner", label: "P03（土日だけ学習）" },
];

for (const { key, label } of LEARNERS) {
  test.describe(`学習が溜まった生徒の見え方: ${label}`, () => {
    test.use({ storageState: storageStatePath(key) });

    test("ホーム・トレーニング記録・各履歴が表示される（ステップ1・9・11）", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page.getByText("今週のトレーニング", { exact: true })).toBeVisible();
      await expect(page.getByText("これまでの歩み", { exact: true })).toBeVisible();
      await expect(page.getByText(/^次の節目/).first()).toBeVisible();

      await page.getByRole("link", { name: "記録を見る" }).click();
      await page.waitForURL("**/training/performance**");
      await expect(page.getByRole("heading", { level: 1, name: "トレーニング記録" })).toBeAttached();
      await expect(page.getByText(/月のまとめ$/)).toBeVisible();

      await page.goto("/training/word/history");
      await expect(page.getByRole("heading", { level: 1, name: "単語帳の履歴" })).toBeVisible();

      await page.goto("/training/sprint/history");
      await expect(page.getByRole("heading", { level: 1, name: "スプリントの履歴" })).toBeVisible();
    });
  });
}
