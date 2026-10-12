import { test } from "node:test";
import assert from "node:assert/strict";
import { maskEmails, sanitizeForLog, serializeError } from "../../packages/lib/logger/sanitize.ts";

/**
 * ログへ出す値の整形（機微情報のマスク・サイズ抑制・エラーの直列化）
 * ルール: docs/LOGGING.md
 */

test("Error は type / message / stack を残す（Object.entries では空になるため）", () => {
  const e = serializeError(new TypeError("boom"));
  assert.equal(e.type, "TypeError");
  assert.equal(e.message, "boom");
  assert.ok(e.stack?.includes("boom"));
});

test("Supabase の PostgrestError 相当（プレーンなオブジェクト）は code / details / hint を残す", () => {
  const e = serializeError({ message: "duplicate key", code: "23505", details: "Key (email)=(taro@example.com) already exists.", hint: null });
  assert.equal(e.type, "Object");
  assert.equal(e.code, "23505");
  assert.equal(e.details, "Key (email)=(t***@example.com) already exists.");
  assert.equal(e.hint, undefined);
});

test("cause を辿り、throw された文字列等も message にする", () => {
  const e = serializeError(new Error("outer", { cause: new Error("inner") }));
  assert.equal(e.cause?.message, "inner");
  assert.deepEqual(serializeError("plain"), { type: "string", message: "plain" });
});

test("ブラウザで整形済みのエラー（type を持つ）は type を引き継ぐ", () => {
  const e = serializeError({ type: "NotAllowedError", message: "denied" });
  assert.equal(e.type, "NotAllowedError");
});

test("メールアドレスは先頭1文字とドメインだけ残す", () => {
  assert.equal(maskEmails("invite a.b+c@mail.example.co.jp failed"), "invite a***@mail.example.co.jp failed");
});

test("payload の機微情報キーは値ごと伏せ、入れ子の Error は中身を残す", () => {
  const out = sanitizeForLog({ password: "x", nested: { accessToken: "y", ok: 1 }, err: new Error("e") }) as Record<string, unknown>;
  assert.equal(out.password, "[REDACTED]");
  assert.deepEqual((out.nested as Record<string, unknown>).accessToken, "[REDACTED]");
  assert.equal((out.nested as Record<string, unknown>).ok, 1);
  assert.equal((out.err as { message: string }).message, "e");
});

test("大きすぎる配列・文字列は切り詰める", () => {
  const arr = sanitizeForLog(Array.from({ length: 50 }, (_, i) => i)) as { truncated: boolean; length: number; sample: number[] };
  assert.equal(arr.truncated, true);
  assert.equal(arr.length, 50);
  assert.deepEqual(arr.sample, [0, 1, 2]);
  const str = sanitizeForLog("a".repeat(1500)) as string;
  assert.ok(str.startsWith("a".repeat(1000)));
  assert.ok(str.endsWith("(truncated, 1500 chars)"));
});
