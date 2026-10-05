import { expect, type Page } from "@playwright/test";

/**
 * 画面の Supabase Realtime の購読状況を見張る（ページを開く前に呼ぶ）。
 *
 * 画面の件数・一覧はサーバーで取得して最初から表示されるため、「件数が表示された＝Realtime の準備完了」ではない。
 * 購読が完了する前に相手が送信すると、その新着は画面に届かない（ページを開いてから約1秒の隙間）。
 * 新着のリアルタイム反映を確かめるテストは、送信の前に waitForSubscribed で対象の購読の完了を待つ。
 *
 * @example
 *   const realtime = watchRealtime(page);
 *   await page.goto("/dashboard");
 *   await realtime.waitForSubscribed("notification_");
 *   await sendAsCoach(...);
 */
export function watchRealtime(page: Page) {
  const subscribed = new Set<string>();
  page.on("websocket", (ws) => {
    ws.on("framereceived", (frame) => {
      const payload = String(frame.payload);
      if (!payload.includes("Subscribed to PostgreSQL")) return;
      const topic = payload.match(/"realtime:([^"]+)"/)?.[1];
      if (topic) subscribed.add(topic);
    });
  });

  return {
    /** チャンネル名が prefix で始まる購読の完了を待つ（例: "notification_"・"chat_rooms_"） */
    waitForSubscribed: (prefix: string) =>
      expect
        .poll(() => [...subscribed].some((topic) => topic.startsWith(prefix)), {
          message: `Realtime の購読（${prefix}…）が完了しない`,
          timeout: 15_000,
        })
        .toBe(true),
  };
}
