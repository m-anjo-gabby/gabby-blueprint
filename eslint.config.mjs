import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Next.js のアプリはリポジトリ直下ではなく apps/* にある。
  // React の版は明示する（eslint-plugin-react の自動判定は ESLint 10 で削除された API を使っており動かない）。
  // catalog の react のメジャー版を上げたら合わせる
  {
    settings: {
      next: { rootDir: ['apps/*/'] },
      react: { version: '19' },
    },
  },

  {
    rules: {
      // any は使わない（DB の値は packages/types/db.ts の型、外部の値は unknown で受けて検証する）
      '@typescript-eslint/no-explicit-any': 'error',
      // 使わない変数は消す。分割代入で残りを取り出すための変数と、_ で始まる名前（意図して使わない引数等）は許可する
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // 型の書き方をそろえる。docs/CODING.md「型」
      // オブジェクトの形は interface、ユニオン型・別名は type
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      // 型だけの import は type を付ける（実行時の依存と区別する）
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      // 部品は function で宣言し、props の型は引数に付ける
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            'React.FC': '部品は function で宣言し、props の型は引数に付けてください（docs/CODING.md）',
            FC: '部品は function で宣言し、props の型は引数に付けてください（docs/CODING.md）',
          },
        },
      ],
      // catch の値からメッセージを取り出すときは getErrorMessage を使う。docs/LOGGING.md
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ConditionalExpression[test.operator='instanceof'][test.right.name='Error'][consequent.property.name='message']",
          message: 'getErrorMessage(err)（@gabby/lib/logger/errorMessage）を使ってください（docs/LOGGING.md）',
        },
      ],
    },
  },

  // eslint-disable には理由を書く（`// eslint-disable-next-line <ルール> -- 理由`）。使われなくなった指示も止める。docs/CODING.md「道具で止めるもの」
  eslintComments.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@eslint-community/eslint-comments/require-description': 'error',
      // ファイル全体を対象にする指示（メールの HTML 等）は閉じなくてよい
      '@eslint-community/eslint-comments/disable-enable-pair': ['error', { allowWholeFile: true }],
    },
  },

  // 実DBから生成する型（supabase/release/types.mjs）は生成の形のままにする（手で直すと作り直すたびに崩れる）
  {
    files: ['packages/types/database.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': 'off' },
  },

  // ログは共通ロガー（サーバー: logger、ブラウザ: clientLogger）に集約する。docs/LOGGING.md
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
    },
  },

  // 生成物は lint しない。設定はリポジトリ直下にあるため、各アプリ配下にも効くよう「**/」を付ける
  globalIgnores([
    '**/.next/**',
    '**/.next-measure/**',
    '**/out/**',
    '**/build/**',
    '**/dist/**',
    '**/.turbo/**',
    '**/.vercel/**',
    '**/next-env.d.ts',
    'testing/e2e/.artifacts/**',
    '**/playwright-report/**',
    '**/test-results/**',
  ]),
]);

export default eslintConfig;
