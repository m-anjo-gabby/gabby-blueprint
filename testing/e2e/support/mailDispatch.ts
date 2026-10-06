import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { request, type APIResponse } from "@playwright/test";
import { ADMIN_BASE_URL, E2E_ENV } from "./targets.ts";

/**
 * 通知・リマインダーのメールの送信処理（admin の /api/cron/mail-dispatch）を、pg_cron の代わりにテストから呼ぶ。
 * 秘密のキーは環境変数 CRON_SECRET、無ければ dev は apps/admin/.env.local から読む（ステージングは環境変数で渡す）。
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function cronSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  if (E2E_ENV !== "dev") return undefined;
  const envPath = path.join(REPO_ROOT, "apps/admin/.env.local");
  if (!existsSync(envPath)) return undefined;
  return dotenv.parse(readFileSync(envPath)).CRON_SECRET || undefined;
}

/**
 * 運営向けのメール配信の日次の要約の宛先（admin の MAIL_OPS_ALERT_TO）。環境変数、無ければ dev は apps/admin/.env.local から読む。
 * dev では Resend のテスト用アドレス（delivered+...@resend.dev）にしておく。
 */
export function opsAlertAddress(): string | undefined {
  if (process.env.MAIL_OPS_ALERT_TO) return process.env.MAIL_OPS_ALERT_TO;
  if (E2E_ENV !== "dev") return undefined;
  const envPath = path.join(REPO_ROOT, "apps/admin/.env.local");
  if (!existsSync(envPath)) return undefined;
  return dotenv.parse(readFileSync(envPath)).MAIL_OPS_ALERT_TO || undefined;
}

/** 送信処理を呼ぶ（secret を null にすると認証なしで呼ぶ） */
export async function invokeMailDispatch(secret: string | null = cronSecret() ?? null): Promise<APIResponse> {
  const context = await request.newContext({ baseURL: ADMIN_BASE_URL, ignoreHTTPSErrors: true });
  try {
    const response = await context.post("/api/cron/mail-dispatch", {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      timeout: 90_000,
    });
    // 本文はコンテキストを閉じる前に読み込んでおく
    await response.body();
    return response;
  } finally {
    await context.dispose();
  }
}

/** 運営向けのメール配信の日次の要約を呼び、状態と結果（JSON）を返す */
export async function invokeMailDailyReport(secret: string | null = cronSecret() ?? null): Promise<{ status: number; body: unknown }> {
  const context = await request.newContext({ baseURL: ADMIN_BASE_URL, ignoreHTTPSErrors: true });
  try {
    const response = await context.post("/api/cron/mail-dispatch", {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      data: { task: "daily_report" },
      timeout: 90_000,
    });
    // 本文はコンテキストを閉じる前に読む
    return { status: response.status(), body: await response.json() };
  } finally {
    await context.dispose();
  }
}
