import { expect, test, type Page } from "@playwright/test";
import { openAdminContext } from "../../support/adminApp.ts";

/**
 * アドミンの一覧（顧客・契約・ユーザー・教材・お知らせ・カレンダーイベント・規約・タイムゾーン）の
 * 検索・絞り込み・条件のクリア・ページ送り（共通部品 apps/admin/components/list/）。
 * dev の既存データを読むだけで、データは作らない。admin は PC 表示の別コンテキストで開くため desktop だけで実行する。
 */

/** どの一覧にも一致しない検索語（PostgREST の条件の区切り・LIKE の特殊文字を含め、エラーにならず0件になることも確かめる） */
const NO_MATCH = 'zz-e2e-no-match,)"%_\\';

const LISTS = [
  { path: "/clients", heading: "顧客管理", placeholder: "顧客名で検索...", empty: "顧客データが見つかりませんでした。" },
  { path: "/contracts", heading: "契約管理", placeholder: "顧客名・契約名で契約を検索...", empty: "一致する契約情報が見つかりませんでした。" },
  { path: "/users", heading: "ユーザー管理", placeholder: "検索語句を入力...", empty: "データが見つかりませんでした。" },
  { path: "/contents", heading: "教材管理", placeholder: "教材名、ラベルで検索...", empty: "教材データが見つかりませんでした。" },
  { path: "/notice", heading: "お知らせ管理", placeholder: "タイトルで検索...", empty: "お知らせが見つかりません" },
  { path: "/calendar-events", heading: "カレンダーイベント管理", placeholder: "タイトルで検索...", empty: "カレンダーイベントが見つかりませんでした。" },
  { path: "/terms", heading: "規約管理", placeholder: "バージョン名で検索...", empty: "規約データが見つかりませんでした。" },
  { path: "/timezones", heading: "タイムゾーン管理", placeholder: "タイムゾーン名、表示名称で検索...", empty: "タイムゾーンデータが見つかりませんでした。" },
] as const;

const clearButton = (page: Page) => page.getByRole("button", { name: "条件をクリア" });

test.describe("アドミンの一覧の検索・絞り込み", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "アドミンの画面は desktop のみ");
  });

  test("各一覧で検索すると URL に条件が載り、「条件をクリア」で初期状態に戻る", async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await openAdminContext(browser);
    try {
      for (const list of LISTS) {
        await test.step(list.heading, async () => {
          await page.goto(list.path);
          await expect(page.getByRole("heading", { level: 1, name: list.heading })).toBeVisible();
          await expect(clearButton(page)).toBeDisabled();

          const search = page.getByLabel(list.placeholder);
          await search.fill(NO_MATCH);
          await search.press("Enter");
          await expect(page).toHaveURL((url) => url.searchParams.get("q") === NO_MATCH);
          await expect(page.getByText(list.empty)).toBeVisible();
          await expect(page.getByText(/全 0 件/)).toBeVisible();

          await clearButton(page).click();
          await expect(page).toHaveURL((url) => url.pathname === list.path && url.search === "");
          await expect(search).toHaveValue("");
          await expect(clearButton(page)).toBeDisabled();
          await expect(page.getByText(list.empty)).toBeHidden();
        });
      }
    } finally {
      await context.close();
    }
  });

  test("ユーザー一覧: 区分で絞り込み、ページを送ってから検索すると1ページ目に戻り、クリアで全条件が外れる", async ({ browser }) => {
    const { context, page } = await openAdminContext(browser);
    try {
      await page.goto("/users");
      await page.getByRole("combobox", { name: "区分" }).click();
      await page.getByRole("option", { name: "生徒" }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("userType") !== null);
      await expect(clearButton(page)).toBeEnabled();
      // URL の条件から開き直しても、選んだ区分名が表示される
      await page.reload();
      await expect(page.getByRole("combobox", { name: "区分" })).toHaveText("生徒");

      // dev の生徒は1ページ（10件）より多い前提
      await page.getByRole("button", { name: "次のページ" }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("page") === "2");

      const search = page.getByLabel("検索語句を入力...");
      await search.fill("qa-");
      await search.press("Enter");
      await expect(page).toHaveURL((url) => url.searchParams.get("q") === "qa-" && !url.searchParams.has("page"));
      await expect(page).toHaveURL((url) => url.searchParams.get("userType") !== null);

      await clearButton(page).click();
      await expect(page).toHaveURL((url) => url.search === "");
      await expect(page.getByRole("combobox", { name: "区分" })).toHaveText("すべての区分");
    } finally {
      await context.close();
    }
  });

  test("タイムゾーン一覧（全件をブラウザで絞る一覧）: 検索で絞り込まれ、ブラウザの戻るで検索前に戻る", async ({ browser }) => {
    const { context, page } = await openAdminContext(browser);
    try {
      await page.goto("/timezones");
      const search = page.getByLabel("タイムゾーン名、表示名称で検索...");
      await search.fill("Asia/Tokyo");
      await search.press("Enter");
      await expect(page).toHaveURL((url) => url.searchParams.get("q") === "Asia/Tokyo");
      await expect(page.getByText(/全 1 件/)).toBeVisible();
      await expect(page.getByRole("cell", { name: "Asia/Tokyo" })).toBeVisible();

      await page.goBack();
      await expect(page).toHaveURL((url) => url.search === "");
      await expect(search).toHaveValue("");
      await expect(clearButton(page)).toBeDisabled();
    } finally {
      await context.close();
    }
  });
});
