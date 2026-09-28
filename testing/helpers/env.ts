import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export type TestEnv = "dev" | "staging";

const ENV_FILE_MAP: Record<TestEnv, string> = {
  dev: "apps/student/.env.local",
  staging: "apps/student/.env.staging",
};

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../..");
// テスト専用の機微情報（QAアカウント共通パスワード等）。Git管理外。雛形は testing/.env.example
const TESTING_ENV_FILE = "testing/.env.local";

/**
 * dev/staging を指定してSupabase等の接続情報を process.env にロードする。
 * リポジトリ直下の .env.local は死んでいるプロジェクトを指すため、
 * 必ず apps/student 配下の env ファイルを使用する（CLAUDE.md 6章参照）。
 */
export function loadTestEnv(env: TestEnv): void {
  const relativePath = ENV_FILE_MAP[env];
  const envPath = path.join(REPO_ROOT, relativePath);

  if (!existsSync(envPath)) {
    throw new Error(
      `テスト対象envファイルが見つかりません: ${relativePath}\n` +
        `apps/student/.env.example を参考に作成してください。`
    );
  }

  const result = dotenv.config({ path: envPath, override: true });
  if (result.error) {
    throw new Error(`envファイルの読み込みに失敗しました: ${relativePath}\n${result.error.message}`);
  }

  // シェルで明示的に渡した値を優先するため override しない
  const testingEnvPath = path.join(REPO_ROOT, TESTING_ENV_FILE);
  if (existsSync(testingEnvPath)) {
    dotenv.config({ path: testingEnvPath, override: false, quiet: true });
  }

  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`envファイル ${relativePath} に以下のキーがありません: ${missing.join(", ")}`);
  }

  process.env.GABBY_TEST_ENV = env;
}

/** --env=dev|staging 形式の引数からTestEnvを取得する。未指定はdev扱い。 */
export function resolveTestEnvFromArgs(argv: string[] = process.argv): TestEnv {
  const arg = argv.find((a) => a.startsWith("--env="));
  const value = arg?.split("=")[1] ?? "dev";
  if (value !== "dev" && value !== "staging") {
    throw new Error(`--env には dev または staging を指定してください（指定値: ${value}）`);
  }
  return value;
}
