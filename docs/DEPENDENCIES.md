# 依存関係・実行環境の管理

依存パッケージ・Node.js・pnpm・GitHub Actions の版の決め方と、更新の進め方の正本です。

## 1. 版を決める場所

| 対象 | 正本 | 合わせる場所 |
|---|---|---|
| 依存パッケージ（全アプリ・`packages/*`・`testing`） | `pnpm-workspace.yaml` の `catalog` | 各 `package.json` は `"catalog:"` で参照する（`pnpm lint` の `scripts/check-catalog.mjs` で確かめる） |
| Node.js | `.nvmrc`（メジャー版） | ルートと `apps/*` の `package.json` の `engines.node`（Vercel のビルドはアプリの `engines` に従う）・`scripts/dev-env/setup.ps1` の `$nodeMajor` |
| pnpm | ルートの `package.json` の `packageManager` | `docs/SETUP.md`（手元は corepack が `packageManager` の版を使う） |
| GitHub Actions | `.github/workflows/*.yml` の `uses:` | — |

- 版の数字は上の正本にだけ書きます。`CLAUDE.md` や他のドキュメントには、メジャー版と方針だけを書きます。
- 同じパッケージをアプリごとに別の版で使いません（catalog は1つだけ）。

### catalog の書き方

- 原則は `^x.y.z`（0.x 系は `^0.y.z` で、マイナー版の中だけ上がる）。
- `next` / `react` / `react-dom` / `eslint-config-next` / `babel-plugin-react-compiler` は版を完全に固定し、一緒に上げます（組み合わせで動作が決まるため）。
- `@types/node` は実行環境の Node のメジャー版に合わせます（最新のメジャー版にしない）。

### パッケージを追加する

```powershell
pnpm --filter gabby-blueprint-student add <パッケージ> --save-catalog   # catalog に追加し、package.json は "catalog:" になる
```

- 2つ以上のアプリで使うロジックは `packages/lib` に置き、依存も `packages/lib` に足します（`CLAUDE.md` §3）。
- pnpm 10 から、依存パッケージのインストール時スクリプトは許可したものしか実行されません。`pnpm install` で「Ignored build scripts」と表示されたら、必要なものだけ `pnpm-workspace.yaml` の `onlyBuiltDependencies` に足します。

## 2. 実行環境

| 対象 | 方針 |
|---|---|
| Node.js | Active LTS / Maintenance LTS のメジャー版を使います（現在は 24）。次の LTS へは、Vercel の対応を確認してから `.nvmrc` と §1 の合わせる場所をまとめて変えます |
| pnpm | Vercel が対応している最新のメジャー版を使います（現在は 10。Vercel は pnpm 11 以降に未対応のため、対応が公表されるまで上げない） |
| TypeScript・ESLint 等の道具 | catalog で管理し、依存パッケージと同じ流れで更新します |

## 3. 更新の流れ

### マイナー版・パッチ版（月1回）

1. Dependabot（`.github/dependabot.yml`）が月1回、マイナー版・パッチ版をまとめた PR を作ります（メジャー版は作りません）。
2. GitHub Actions の `CI`（型チェック・lint・単体テスト）が通ることを確認します。
3. 開発ブランチ（`feature/YYYYMMDD-dev`）に取り込み、`pnpm build` と主要な E2E（`testing/e2e/CONVENTIONS.md`）で確認してから、通常のリリースに乗せます。

セキュリティ修正（Dependabot alerts）は版の種類に関わらず随時 PR になるため、内容を見て早めに取り込みます。

### メジャー版（計画して1つずつ）

1. 変更履歴（CHANGELOG・移行ガイド）で、互換性の壊れる変更と、このリポジトリで影響のある箇所を確認します。
2. 1つのパッケージ（または一緒に上げる必要がある組）ごとにコミットを分けます。
3. `pnpm check` と `pnpm build`、影響のある画面の E2E で確認します。
4. 下の「保留中のメジャー版」の表を更新します。

### 保留中のメジャー版

現在のメジャー版のまま据え置いているものと、その理由です。上げたら行を消します。

| パッケージ | 現在 | 最新 | 据え置く理由・上げる条件 |
|---|---|---|---|
| — | — | — | — |

## 4. GitHub Actions

- `CI`（`.github/workflows/ci.yml`）: `main` / `staging` / `feature/**` への push と PR で、`pnpm check` と同じ内容を実行します。
- `Deploy`（`.github/workflows/deploy.yml`）: 手動で実行します（`docs/RELEASE.md`）。
- Action の版（`actions/checkout` 等）は、Dependabot が月1回まとめて PR を作ります。
