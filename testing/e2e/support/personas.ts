import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * E2Eで使う固定アカウント（testing/FIXTURES.md「固定アカウント一覧」の一部）。
 * 固定アカウントは閲覧系のテストにのみ使う（e2e/CONVENTIONS.md 3章）。
 */
export const PERSONAS = {
  /** ライブセッション付き契約あり（チャットタブが表示される） */
  liveStudent: { email: "qa-student-01@gabby-qa-test.example" },
  /** アプリのみ契約＋monitorロール（ライブセッションは紹介画面、モニタータブが表示される） */
  monitorStudent: { email: "qa-student-02@gabby-qa-test.example" },
  /** ポップアップ検証用（専用テナント所属）。規約同意・お知らせの状態をテストが都度作り直す */
  popupStudent: { email: "qa-student-07@gabby-qa-test.example" },
} as const;

export type PersonaKey = keyof typeof PERSONAS;

const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.auth");

/** ログイン状態（Cookie等）の保存先。git管理外 */
export const storageStatePath = (key: PersonaKey): string => path.join(AUTH_DIR, `${key}.json`);

export function getPersonaPassword(): string {
  const password = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
  if (!password) {
    throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です（testing/.env.local を確認してください）。");
  }
  return password;
}
