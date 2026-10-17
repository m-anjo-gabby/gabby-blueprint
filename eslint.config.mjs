import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Next.js のアプリはリポジトリ直下ではなく apps/* にある。
  // React の版は明示する（eslint-plugin-react の自動判定は ESLint 10 で削除された API を使っており動かない）。
  // catalog の react のメジャー版を上げたら合わせる
  {
    settings: {
      next: { rootDir: ["apps/*/"] },
      react: { version: "19" },
    },
  },

  {
    rules: {
      // any乱用防止（境界のみ許可）
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ログは共通ロガー（サーバー: logger、ブラウザ: clientLogger）に集約する。docs/LOGGING.md
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
    },
  },

  // 生成物は lint しない。設定はリポジトリ直下にあるため、各アプリ配下にも効くよう「**/」を付ける
  globalIgnores([
    "**/.next/**",
    "**/.next-measure/**",
    "**/out/**",
    "**/build/**",
    "**/dist/**",
    "**/.turbo/**",
    "**/.vercel/**",
    "**/next-env.d.ts",
    "testing/e2e/.artifacts/**",
    "**/playwright-report/**",
    "**/test-results/**",
  ]),
]);

export default eslintConfig;
