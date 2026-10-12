import { expect, test, type Page } from "@playwright/test";
import { coachNav, openCoachContext } from "../../support/coachApp.ts";

/**
 * スモーク: コーチアプリの主要画面（docs/screens/coach/）。
 * 固定アカウントの qa-coach-ca-01 でログインし、サイドバーの各項目・サイドバーに無い画面を開いて、見出しが表示されることと、
 * 初期表示に必要なデータをサーバーで取得している（表示後にブラウザからサーバーアクションを呼ばない。CLAUDE.md「ローディング表示」）
 * ことを確かめる。閲覧のみ（DBは変更しない）。
 * coach は別のブラウザコンテキスト（PC表示）で開くため、desktop プロジェクトだけで実行する。
 */

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "coach は PC 表示の別コンテキストで開くため desktop だけで実行する");
  // 1つのテストで複数の画面を開くため（dev サーバーでは初回のコンパイルも重なる）
  test.slow();
});

/** サイドバーの項目と、開いた画面の見出し */
const NAV_PAGES = [
  { label: "My Students", path: "/students", heading: "My Students" },
  { label: "Chat", path: "/chat", heading: "Chat" },
  { label: "Calendar", path: "/calendar", heading: "Calendar" },
  { label: "Monthly Report", path: "/monthly-reports", heading: "Monthly Report" },
  { label: "Dashboard", path: "/dashboard", heading: /^Good (morning|afternoon|evening), / },
] as const;

/** サイドバーに無い画面（ヘッダーのメニュー・カレンダー等から開く） */
const OTHER_PAGES = [
  { path: "/matching-requests", heading: "Requests" },
  { path: "/availability", heading: "Weekly Availability" },
  { path: "/profile", heading: "Profile Settings" },
  { path: "/notice", heading: "Notices" },
  { path: "/notification", heading: "Notifications" },
] as const;

/** ページを直接開き、通信が落ち着くまでにブラウザから呼ばれたサーバーアクション（Next-Action ヘッダー付きPOST）の数 */
async function countServerActionsOnLoad(page: Page, path: string): Promise<number> {
  let count = 0;
  const onRequest = (request: { method(): string; headers(): Record<string, string> }) => {
    if (request.method() === "POST" && request.headers()["next-action"]) count += 1;
  };
  page.on("request", onRequest);
  await page.goto(path, { waitUntil: "networkidle" });
  page.off("request", onRequest);
  return count;
}

test("サイドバーの各項目から画面を開ける", async ({ browser }) => {
  const { context, page } = await openCoachContext(browser);
  try {
    for (const { label, path, heading } of NAV_PAGES) {
      await coachNav(page).getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("サイドバーに無い画面も見出しまで表示される", async ({ browser }) => {
  const { context, page } = await openCoachContext(browser);
  try {
    for (const { path, heading } of OTHER_PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("主要画面を開いた時、ブラウザからサーバーアクションを呼ばない", async ({ browser }) => {
  const { context, page } = await openCoachContext(browser);
  try {
    const counts: Record<string, number> = {};
    for (const path of [...NAV_PAGES.map((p) => p.path), "/matching-requests", "/availability"]) {
      counts[path] = await countServerActionsOnLoad(page, path);
    }
    expect(counts).toEqual(Object.fromEntries(Object.keys(counts).map((path) => [path, 0])));
  } finally {
    await context.close();
  }
});
