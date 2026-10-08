import { expect, test } from "../../support/studentApp.ts";

/**
 * スモーク: ブラウザのログの受け口（/api/client-log。docs/LOGGING.md）。
 * エラー画面は未ログインでも出るため、ログインなしで受け付けること、形・大きさの不正な本文を弾くことを確認する。
 */

test("ログインなしで正しい形のログを受け付ける", async ({ request }) => {
  const res = await request.post("/api/client-log", {
    data: { event: "e2e:client_log_smoke", level: "info", message: "E2E smoke", path: "/e2e" },
  });
  expect(res.status()).toBe(204);
});

test("イベント名・レベルが規約に合わない本文は 400", async ({ request }) => {
  const badEvent = await request.post("/api/client-log", { data: { event: "no-colon", level: "info", message: "x" } });
  expect(badEvent.status()).toBe(400);
  const badLevel = await request.post("/api/client-log", { data: { event: "e2e:x", level: "debug", message: "x" } });
  expect(badLevel.status()).toBe(400);
});

test("大きすぎる本文は 413", async ({ request }) => {
  const res = await request.post("/api/client-log", {
    data: { event: "e2e:x", level: "info", message: "x", payload: { blob: "a".repeat(20_000) } },
  });
  expect(res.status()).toBe(413);
});
