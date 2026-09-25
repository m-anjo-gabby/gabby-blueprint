import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./helpers/env.ts";

/**
 * E2E（Playwright）設定。規約は testing/e2e/CONVENTIONS.md を参照。
 *
 * - 接続先は dev のみ（apps/student/.env.local を使うローカル dev サーバー）。
 * - student の dev サーバー（`dev:ssl`、https://localhost:3000）が既に起動していればそれを使う。
 *   起動していなければ Playwright が起動し、テスト終了時に停止する。
 *   ※ Next.js 16 は同一アプリの dev サーバーを二重起動できない（.next/dev/lock）ため、別ポートでの
 *     E2E専用サーバーは立てない。
 * - 出力はトークン・ノイズを抑えるため最小限（line reporter、dev サーバーの標準出力は捨てる）。
 *   詳細な調査が必要な場合は HTML レポート / trace を人が開いて確認する。
 */
loadTestEnv("dev");

const TESTING_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TESTING_DIR, "..");
const BASE_URL = process.env.E2E_BASE_URL ?? "https://localhost:3000";
const ARTIFACTS_DIR = path.join(TESTING_DIR, "e2e/.artifacts");

export default defineConfig({
  testDir: "./e2e/tests",
  outputDir: path.join(ARTIFACTS_DIR, "results"),
  // 固定アカウント・dev DB を共有するため直列実行を基本とする（CONVENTIONS 3章）
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 失敗を再試行で隠さない（不安定なテストはロケーター等を直す）
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: path.join(ARTIFACTS_DIR, "report") }],
  ],
  use: {
    baseURL: BASE_URL,
    // dev:ssl は自己署名証明書のため
    ignoreHTTPSErrors: true,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: "pnpm --filter gabby-blueprint-student run dev:ssl",
    cwd: REPO_ROOT,
    url: `${BASE_URL}/login`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    // 初回コンパイルに時間がかかるため長めに取る
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
    },
    {
      // Chromium でのモバイル端末エミュレーション（実機Safariの代替ではない。FIXTURES.md 参照）
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
    },
  ],
});
