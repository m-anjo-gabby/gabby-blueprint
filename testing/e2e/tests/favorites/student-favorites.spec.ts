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
import { clickUntilVisible } from "../../support/hydration.ts";

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

/** お気に入りの一覧のカード */
const favoriteCards = (page: Page): Locator => page.locator("article");

/** ピル・選択肢の末尾の件数 */
async function trailingCount(locator: Locator): Promise<number> {
  const text = (await locator.textContent()) ?? "";
  const match = text.match(/(\d+)\s*$/);
  if (!match) throw new Error(`件数が読めません: ${text}`);
  return Number(match[1]);
}

/**
 * 絞り込みの項目で、先頭（「すべて」）の次の選択肢を選び、その選択肢の件数を返す。
 * PC はセレクト、mobile は「絞り込み」シートのチップで選ぶ。
 */
async function chooseFirstOption(page: Page, isMobile: boolean, label: string): Promise<number> {
  if (isMobile) {
    const sheet = page.getByRole("dialog", { name: "絞り込み" });
    await clickUntilVisible(page.getByRole("button", { name: /^絞り込み/ }), sheet);
    const option = sheet.getByRole("region", { name: label }).getByRole("button").nth(1);
    const count = await trailingCount(option);
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
    await sheet.getByRole("button", { name: /件を表示$/ }).click();
    await expect(sheet).toBeHidden();
    return count;
  }
  const option = page.getByRole("option").nth(1);
  await clickUntilVisible(page.getByRole("combobox", { name: label }), option);
  const count = await trailingCount(option);
  await option.click();
  await expect(option).toBeHidden();
  return count;
}

/** 絞り込みの項目が出ているか（mobile はシートを開いて確かめて閉じる） */
async function expectFilterShown(page: Page, isMobile: boolean, label: string, shown: boolean): Promise<void> {
  if (!isMobile) {
    await expect(page.getByRole("combobox", { name: label })).toHaveCount(shown ? 1 : 0);
    return;
  }
  const sheet = page.getByRole("dialog", { name: "絞り込み" });
  await clickUntilVisible(page.getByRole("button", { name: /^絞り込み/ }), sheet);
  await expect(sheet.getByRole("region", { name: label })).toHaveCount(shown ? 1 : 0);
  await sheet.getByRole("button", { name: /件を表示$/ }).click();
  await expect(sheet).toBeHidden();
}

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

test.describe("使い捨ての生徒（お気に入りの上限）", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let fixture: AuthFixture | undefined;

  test.afterEach(async () => {
    await cleanupAuthFixture(fixture);
    fixture = undefined;
  });

  test("上限（1,000件）のフレーズがあると、☆で登録できずトーストが出て☆が戻り、お気に入りに上限の案内が出る", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
    test.setTimeout(180_000);

    const f = await createAuthFixture("favlim");
    fixture = f;
    const email = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
    const userId = await createDisposableStudent(f, { email, password: PASSWORD });
    await grantAppLicense(f, userId);

    // 単語帳の教材ごとの公開中のフレーズ。最も少ない教材をトレーニングに使い、ほかの教材のフレーズで1,000件を埋める
    // （お気に入り画面は見える教材のフレーズだけを数えるため、限定公開の教材は使い捨ての顧客に公開する。公開先は後始末で消える）
    const { data: contents, error: contentsError } = await f.admin
      .from("com_m_contents")
      .select("content_id, content_scope")
      .eq("content_type", 0)
      .in("content_scope", [0, 1])
      .eq("delete_flg", "0")
      .not("content_name", "like", "[%");
    if (contentsError || !contents) throw new Error(`単語帳の教材の取得に失敗しました: ${contentsError?.message}`);
    const phrasesByContent = await Promise.all(
      contents.map(async (c) => {
        const ids: string[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await f.admin
            .from("com_m_phrase")
            .select("phrase_id, com_m_word!inner(content_id, status)")
            .eq("status", "live")
            .eq("com_m_word.content_id", c.content_id)
            .eq("com_m_word.status", "live")
            .order("phrase_id")
            .range(from, from + 999);
          if (error) throw new Error(`フレーズの取得に失敗しました: ${error.message}`);
          ids.push(...data.map((p) => p.phrase_id));
          if (data.length < 1000) break;
        }
        return { ...c, ids };
      })
    );
    const usable = phrasesByContent.filter((c) => c.ids.length > 0).sort((a, b) => a.ids.length - b.ids.length);
    const [training, ...others] = usable;
    const fillIds = others.flatMap((c) => c.ids).slice(0, 1000);
    test.skip(!training || fillIds.length < 1000, "この環境には上限まで埋めるだけのフレーズがない");

    const restricted = [training, ...others].filter((c) => c.content_scope === 1).map((c) => ({ client_id: f.clientId, content_id: c.content_id }));
    if (restricted.length > 0) {
      const { error } = await f.admin.from("com_m_contents_access").insert(restricted);
      if (error) throw new Error(`教材の公開先の追加に失敗しました: ${error.message}`);
    }
    for (let i = 0; i < fillIds.length; i += 500) {
      const { error } = await f.admin
        .from("com_t_favorite_phrase")
        .insert(fillIds.slice(i, i + 500).map((phrase_id) => ({ user_id: userId, phrase_id })));
      if (error) throw new Error(`お気に入りの投入に失敗しました: ${error.message}`);
    }

    await loginAsNewStudent(page, email, PASSWORD);

    await test.step("単語帳トレーニングの☆で登録すると、上限のトーストが出て☆が戻る", async () => {
      await page.goto(`/training/word/${training.content_id}`);
      const star = page.getByRole("button", { name: "お気に入りに追加" });
      await expect(star).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState("networkidle");
      await star.click();
      await expect(page.getByText(/お気に入りは1,000件まで登録できます/)).toBeVisible();
      await expect(star).toBeVisible();
      await expect(page.getByRole("button", { name: "お気に入りを解除" })).toHaveCount(0);
      const { count } = await f.admin.from("com_t_favorite_phrase").select("phrase_id", { count: "exact", head: true }).eq("user_id", userId);
      expect(count).toBe(1000);
    });

    await test.step("お気に入り（フレーズ）に上限の案内が出る", async () => {
      await page.goto("/favorites");
      await expect(kindPill(page, "フレーズ")).toHaveAccessibleName(/1000$/);
      await expect(page.getByRole("status").filter({ hasText: "お気に入りのフレーズが上限（1,000件）に達しています" })).toBeVisible();
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

  // 件数・選択肢は固定アカウントのデータに依存させず、選んだ選択肢の件数と一覧の件数が合うことで確かめる
  // （コーパスでレベルが出ないことは、dev にレベル分けの無いコーパスが無いため単体テスト unit/favorite-filters.test.ts で確かめる）
  test("スプリント問題の絞り込みは教材→問題種別→レベルの順に連動し、条件は URL に残り、前の条件を外すと後ろも外れる", async ({ page, isMobile }) => {
    await page.goto("/favorites?kind=sprintQuestions");
    const pill = kindPill(page, "スプリント問題");
    await expect(pill).toHaveAttribute("aria-selected", "true");
    const total = await trailingCount(pill);
    await expect(favoriteCards(page)).toHaveCount(Math.min(total, 50));

    await test.step("レベルは問題種別を選ぶまで出ない", async () => {
      await expectFilterShown(page, isMobile, "教材", true);
      await expectFilterShown(page, isMobile, "レベル", false);
    });

    await test.step("教材 → 問題種別 → レベルの順に選ぶと、URL に載り、一覧が選択肢の件数になる", async () => {
      const byContent = await chooseFirstOption(page, isMobile, "教材");
      await expect(page).toHaveURL(/[?&]content=/);
      await expect(favoriteCards(page)).toHaveCount(byContent);

      const byType = await chooseFirstOption(page, isMobile, "問題種別");
      await expect(page).toHaveURL(/[?&]type=/);
      await expect(favoriteCards(page)).toHaveCount(byType);
      expect(byType).toBeLessThanOrEqual(byContent);

      const byLevel = await chooseFirstOption(page, isMobile, "レベル");
      await expect(page).toHaveURL(/[?&]level=/);
      await expect(favoriteCards(page)).toHaveCount(byLevel);
      expect(byLevel).toBeLessThanOrEqual(byType);

      await page.reload();
      await expect(page).toHaveURL(/content=.*type=.*level=|level=.*type=.*content=/);
      await expect(favoriteCards(page)).toHaveCount(byLevel);
    });

    await test.step("教材の条件を外すと、問題種別・レベルの条件も外れる", async () => {
      if (isMobile) {
        await expect(page.getByRole("button", { name: /の条件を外す$/ })).toHaveCount(3);
        await page.waitForLoadState("networkidle");
        await page.getByRole("button", { name: /^教材「.+」の条件を外す$/ }).click();
      } else {
        const allOption = page.getByRole("option", { name: "すべての教材" });
        await clickUntilVisible(page.getByRole("combobox", { name: "教材" }), allOption);
        await allOption.click();
      }
      await expect(page).not.toHaveURL(/[?&](content|type|level)=/);
      await expect(favoriteCards(page)).toHaveCount(Math.min(total, 50));
    });
  });

  test("検索・絞り込みで該当なしになると「条件をクリア」が出て、押すと検索語と絞り込みが外れる", async ({ page, isMobile }) => {
    await page.goto("/favorites?kind=sprintQuestions");
    const total = await trailingCount(kindPill(page, "スプリント問題"));
    await expect(favoriteCards(page)).toHaveCount(Math.min(total, 50));

    await chooseFirstOption(page, isMobile, "教材");
    await expect(page).toHaveURL(/[?&]content=/);
    const search = page.getByRole("searchbox", { name: "問題を検索" });
    await search.fill("zzzz-e2e-no-match");
    await expect(page.getByText("条件に合う問題が見つかりません")).toBeVisible();
    await expect(favoriteCards(page)).toHaveCount(0);

    await page.getByRole("button", { name: "条件をクリア" }).click();
    await expect(search).toHaveValue("");
    await expect(page).not.toHaveURL(/[?&]content=/);
    await expect(favoriteCards(page)).toHaveCount(Math.min(total, 50));
  });

  test("50件を超える種別は50件ずつ表示し、「さらに表示」で続きを出す", async ({ page }) => {
    await page.goto("/favorites");
    const total = await trailingCount(kindPill(page, "フレーズ"));
    expect(total, "固定アカウントのフレーズのお気に入りが50件を超えていること（FIXTURES.md）").toBeGreaterThan(50);
    await expect(favoriteCards(page)).toHaveCount(50);

    const more = page.getByRole("button", { name: `さらに表示（残り${total - 50}件）` });
    await page.waitForLoadState("networkidle");
    await more.click();
    await expect(favoriteCards(page)).toHaveCount(Math.min(total, 100));
    if (total <= 100) await expect(page.getByRole("button", { name: /^さらに表示/ })).toHaveCount(0);
  });
});
