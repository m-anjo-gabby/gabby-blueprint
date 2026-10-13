import type { Locator, Page } from "@playwright/test";
import { test, expect, loginAsNewStudent } from "../../support/studentApp.ts";
import { storageStatePath } from "../../support/personas.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  cleanupAuthFixture,
  createAuthFixture,
  createDisposableStudent,
  grantAppLicense,
  prepareContent,
  prepareWordContent,
  type AuthFixture,
} from "../../support/authFixtures.ts";

/**
 * お気に入り（仕様: e2e/specs/favorites/student-favorites.md）
 *
 * - 登録・解除を伴うもの: 使い捨てのアプリのみ契約の生徒（desktop のみ）。お気に入りの行はユーザーの削除で消える。
 * - 種別の切り替えと URL: 固定アカウントの生徒01（閲覧のみ。dev でフレーズ・スプリント問題のお気に入りが入っている）。
 * - WebKit はハイドレーション前の操作が無視されるため、画面内の操作は反映を確かめてから進む（KJ-2026-0928-02）。
 */

const PASSWORD = "Favorite2026a";

/** 種別のピル（ラベルの後ろに件数が付く） */
const kindPill = (page: Page, label: string): Locator =>
  page.getByRole("tablist", { name: "お気に入りの種別" }).getByRole("tab", { name: new RegExp(`^${label}\\s*\\d+$`) });

/** 教材種別のタブ（ラベルの後ろに件数が付く） */
const libraryTab = (page: Page, label: string): Locator =>
  page.getByRole("tablist", { name: "教材種別" }).getByRole("tab", { name: new RegExp(`^${label}\\s*\\d+$`) });

const favoriteOnlyToggle = (page: Page): Locator => page.getByRole("button", { name: "お気に入り", exact: true });

test.describe("使い捨てのアプリのみ契約の生徒", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let fixture: AuthFixture | undefined;

  test.afterEach(async () => {
    if (fixture) await fixture.admin.from("com_t_resume_contents").delete().in("user_id", fixture.userIds);
    await cleanupAuthFixture(fixture);
    fixture = undefined;
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
    test.setTimeout(120_000);
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

  test("スプリント結果の☆で登録した問題がお気に入りに出て、お気に入りで解除すると結果画面の☆も外れる", async ({ page }) => {
    const { f, userId } = await startAsNewStudent(page, "favsq");
    const sprint = await prepareContent(f, 2);

    // 教材の問題2問で、スキップした実施の記録を作る（結果画面は記録の問題を出題順に出す）
    const { data: questions, error: qError } = await f.admin
      .from("com_m_sprint_questions")
      .select("question_id, group_id, seq_no, sprint_type, question_type, difficulty_level, question_en")
      .eq("content_id", sprint.content_id)
      .eq("delete_flg", "0")
      .order("question_type")
      .order("difficulty_level")
      .order("seq_no")
      .limit(2);
    if (qError || !questions || questions.length < 2) throw new Error(`スプリントの問題が見つかりません: ${qError?.message}`);
    const [first] = questions;
    const { data: record, error: recordError } = await f.admin
      .from("self_t_sprint")
      .insert({
        user_id: userId,
        sprint_type: first.sprint_type,
        content_id: sprint.content_id,
        question_type: first.question_type,
        answer_type: "0",
        difficulty_level: first.difficulty_level,
        time_limit_sec: 60,
        total_answered: questions.length,
        total_assessments: 0,
        answered_history: questions.map((q) => ({ question_id: q.question_id, group_id: q.group_id, seq_no: q.seq_no, is_skipped: true })),
      })
      .select("self_sprint_id")
      .single();
    if (recordError) throw new Error(`スプリントの記録の作成に失敗しました: ${recordError.message}`);

    const favoriteCount = async () => {
      const { count } = await f.admin.from("com_t_favorite_sprint_question").select("question_id", { count: "exact", head: true }).eq("user_id", userId);
      return count;
    };
    const firstCard = page.locator(`#card-${first.question_id}`);

    await test.step("結果画面の☆で登録する", async () => {
      await page.goto(`/training/sprint/history/${record.self_sprint_id}`);
      await page.waitForLoadState("networkidle");
      await firstCard.getByRole("button", { name: "お気に入りに追加" }).click();
      await expect(page.getByText("お気に入りに追加しました")).toBeVisible();
      await expect(firstCard.getByRole("button", { name: "お気に入りを解除" })).toBeVisible();
      await expect.poll(favoriteCount).toBe(1);
    });

    await test.step("お気に入りのスプリント問題に出て、ゴミ箱で解除できる", async () => {
      await page.goto("/favorites?kind=sprintQuestions");
      await expect(kindPill(page, "スプリント問題")).toHaveAttribute("aria-selected", "true");
      await expect(kindPill(page, "スプリント問題")).toHaveAccessibleName(/1$/);
      const card = page.locator("article").filter({ hasText: first.question_en });
      await expect(card).toBeVisible();

      await page.waitForLoadState("networkidle");
      await card.getByRole("button", { name: "お気に入りから削除" }).click();
      await page.locator("[data-confirm-modal]").getByRole("button", { name: "OK" }).click();
      await expect(page.getByText("お気に入りから削除しました")).toBeVisible();
      await expect(card).toHaveCount(0);
      await expect(page.getByText("お気に入りの問題はまだありません")).toBeVisible();
      await expect.poll(favoriteCount).toBe(0);
    });

    await test.step("結果画面に戻ると☆が外れている", async () => {
      await page.goBack();
      await page.waitForURL(`**/training/sprint/history/${record.self_sprint_id}`);
      await expect(firstCard.getByRole("button", { name: "お気に入りに追加" })).toBeVisible();
    });
  });

  test("単語帳トレーニングで☆を付けてから「戻る」でお気に入りに戻ると、フレーズの件数が増えている", async ({ page }) => {
    const { f, userId } = await startAsNewStudent(page, "favph");
    const word = await prepareWordContent(f);

    await test.step("お気に入り（フレーズ）は0件", async () => {
      await page.goto("/favorites");
      await expect(kindPill(page, "フレーズ")).toHaveAttribute("aria-selected", "true");
      await expect(kindPill(page, "フレーズ")).toHaveAccessibleName(/0$/);
      await expect(page.getByText("お気に入りのフレーズはまだありません")).toBeVisible();
    });

    await test.step("空の表示の案内から教材一覧を開き、単語帳のトレーニングを始める", async () => {
      await page.waitForLoadState("networkidle");
      await page.getByRole("link", { name: "教材一覧を見る" }).click();
      await page.waitForURL("**/library");
      await page.getByPlaceholder("教材を検索...").fill(word.content_name);
      await page.getByRole("button", { name: "トレーニングを始める" }).first().click();
      await page.waitForURL(`**/training/word/${word.content_id}**`);
    });

    await test.step("カードの☆で登録する", async () => {
      const star = page.getByRole("button", { name: "お気に入りに追加" });
      await expect(star).toBeVisible({ timeout: 30_000 });
      await star.click();
      await expect(page.getByText("お気に入りに追加しました")).toBeVisible();
      await expect(page.getByRole("button", { name: "お気に入りを解除" })).toBeVisible();
      const { count } = await f.admin.from("com_t_favorite_phrase").select("phrase_id", { count: "exact", head: true }).eq("user_id", userId);
      expect(count).toBe(1);
    });

    await test.step("「戻る」でお気に入りまで戻ると、取り直されて1件になっている", async () => {
      await page.goBack();
      await page.waitForURL("**/library");
      await page.goBack();
      await page.waitForURL("**/favorites");
      await expect(kindPill(page, "フレーズ")).toHaveAccessibleName(/1$/);
      await expect(page.locator("article").filter({ hasText: word.content_name })).toHaveCount(1);
    });
  });

  test("教材一覧の「お気に入り」で絞り込むと URL に残り、種別タブがお気に入りの件数になり、☆を外すと一覧から消える", async ({ page }) => {
    const { f, userId } = await startAsNewStudent(page, "favct");
    const word = await prepareWordContent(f);
    const sprint = await prepareContent(f, 2);
    const { error } = await f.admin.from("com_t_favorite_contents").insert([
      { user_id: userId, content_id: word.content_id },
      { user_id: userId, content_id: sprint.content_id },
    ]);
    if (error) throw new Error(`お気に入りの教材の登録に失敗しました: ${error.message}`);

    const wordCard = page.locator("div").filter({ has: page.getByText(word.content_name, { exact: true }) }).filter({
      has: page.getByRole("button", { name: "トレーニングを始める" }),
    });

    await test.step("「お気に入り」をオンにすると URL に favorite=1 が付き、お気に入りの2件だけになる", async () => {
      await page.goto("/library");
      await expect(favoriteOnlyToggle(page)).toHaveAttribute("aria-pressed", "false");
      await page.waitForLoadState("networkidle");
      await favoriteOnlyToggle(page).click();
      await expect(page).toHaveURL(/[?&]favorite=1/);
      await expect(favoriteOnlyToggle(page)).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("button", { name: "トレーニングを始める" })).toHaveCount(2);
      await expect(libraryTab(page, "すべて")).toHaveAccessibleName(/2$/);
      await expect(libraryTab(page, "単語帳")).toHaveAccessibleName(/1$/);
    });

    await test.step("☆を外すと、その場で一覧から消えて件数が減る", async () => {
      await wordCard.last().getByRole("button", { name: "お気に入りを解除" }).click();
      await expect(page.getByText(`「${word.content_name}」をお気に入りから解除しました`)).toBeVisible();
      await expect(page.getByText(word.content_name, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "トレーニングを始める" })).toHaveCount(1);
      await expect(libraryTab(page, "すべて")).toHaveAccessibleName(/1$/);
      await expect(libraryTab(page, "単語帳")).toHaveAccessibleName(/0$/);
    });

    await test.step("再読み込みしても絞り込みが残る", async () => {
      await page.reload();
      await expect(favoriteOnlyToggle(page)).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("button", { name: "トレーニングを始める" })).toHaveCount(1);
      const { count } = await f.admin.from("com_t_favorite_contents").select("content_id", { count: "exact", head: true }).eq("user_id", userId);
      expect(count).toBe(1);
    });
  });
});

test.describe("固定アカウントの生徒（閲覧のみ）", () => {
  test.use({ storageState: storageStatePath("liveStudent") });

  test("種別の指定が無ければフレーズを開き、切り替えは URL の kind に残る。kind=contents は教材一覧のお気に入りへ転送される", async ({ page }) => {
    await test.step("種別の指定が無ければフレーズを開く", async () => {
      await page.goto("/favorites");
      await expect(kindPill(page, "フレーズ")).toHaveAttribute("aria-selected", "true");
      await expect(page).not.toHaveURL(/[?&]kind=/);
    });

    await test.step("スプリント問題に切り替えると URL に kind が付き、再読み込みしても残る", async () => {
      // ハイドレーション前の押下は無視されるため、URL が変わるまで押し直す
      await expect(async () => {
        await kindPill(page, "スプリント問題").click({ timeout: 2_000 });
        await expect(page).toHaveURL(/[?&]kind=sprintQuestions/, { timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await expect(kindPill(page, "スプリント問題")).toHaveAttribute("aria-selected", "true");
      await page.reload();
      await expect(kindPill(page, "スプリント問題")).toHaveAttribute("aria-selected", "true");
      await expect(kindPill(page, "フレーズ")).toHaveAttribute("aria-selected", "false");
    });

    await test.step("以前の kind=contents は教材一覧のお気に入りの絞り込みへ転送される", async () => {
      await page.goto("/favorites?kind=contents");
      await page.waitForURL(/\/library\?favorite=1/);
      await expect(favoriteOnlyToggle(page)).toHaveAttribute("aria-pressed", "true");
    });
  });
});
