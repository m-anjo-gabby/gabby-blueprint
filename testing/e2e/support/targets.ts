import type { TestEnv } from "../../helpers/env.ts";

/**
 * E2E の接続先。`E2E_ENV=staging` でステージング（Vercel のデプロイ＋ステージングのDB）、未指定は dev（ローカルの dev サーバー＋dev のDB）。
 * URL は `E2E_BASE_URL` / `E2E_ADMIN_BASE_URL` で個別に上書きできる。運用は e2e/CONVENTIONS.md 7章。
 */
export const E2E_ENV: TestEnv = process.env.E2E_ENV === "staging" ? "staging" : "dev";

const DEFAULT_URLS: Record<TestEnv, { student: string; admin: string }> = {
  dev: { student: "https://localhost:3000", admin: "https://localhost:3001" },
  staging: { student: "https://blueprint-student-stg.vercel.app", admin: "https://blueprint-admin-stg.vercel.app" },
};

export const STUDENT_BASE_URL = process.env.E2E_BASE_URL ?? DEFAULT_URLS[E2E_ENV].student;
export const ADMIN_BASE_URL = process.env.E2E_ADMIN_BASE_URL ?? DEFAULT_URLS[E2E_ENV].admin;

/** ローカルの dev サーバーを使うか（ステージングはデプロイ済みのサイトに接続するため起動しない） */
export const USES_LOCAL_SERVER = E2E_ENV === "dev";
