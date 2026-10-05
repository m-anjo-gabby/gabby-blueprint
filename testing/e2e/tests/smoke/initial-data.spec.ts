import type { Page } from "@playwright/test";
import { storageStatePath } from "../../support/personas.ts";
import { expect, test } from "../../support/studentApp.ts";

/**
 * スモーク: 初期表示のデータ（docs/screens/student/dashboard.md「アプリシェル」、CLAUDE.md「ローディング表示」）。
 * 画面・ヘッダー・ナビの初期表示に必要なデータはサーバーで取得して流し込み、表示後にブラウザから
 * サーバーアクションで取りに行かない（サーバーアクションは1つずつ順番に実行され、海外の利用者ほど遅くなるため）。
 * この方針が後から崩れていないかを、主要画面を直接開いた時のサーバーアクションの回数で確認する。
 * お知らせ・通知の一覧画面は「開くたびに最新を取り直す」方針のためブラウザから取得する（対象外）。
 */

const PAGES = ["/dashboard", "/library", "/favorites", "/training/performance", "/live-room", "/calendar", "/profile"];

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

for (const [persona, label] of [
  ["liveStudent", "ライブセッション契約の生徒"],
  ["monitorStudent", "アプリのみ契約の生徒"],
] as const) {
  test.describe(label, () => {
    test.use({ storageState: storageStatePath(persona) });

    for (const path of PAGES) {
      test(`${path} を開いた時、ブラウザからサーバーアクションを呼ばない`, async ({ page }) => {
        expect(await countServerActionsOnLoad(page, path)).toBe(0);
      });
    }
  });
}
