# リリース手順

開発ブランチ（`feature/YYYYMMDD-dev`）を staging・本番へ出すまでの通しの手順です。
個別の操作の詳しい使い方は各 README にあり、この文書は**順番と確認項目**の正本です。

| 操作 | 詳細 |
|---|---|
| DB のリリーススクリプトの適用（`run.mjs`）・正本との突き合わせ（`schema.mjs`） | [supabase/release/README.md](../supabase/release/README.md) |
| 環境変数の反映（`pnpm vercel-env`）・アプリのデプロイ（GitHub Actions の `Deploy`） | [scripts/vercel-env/README.md](../scripts/vercel-env/README.md) |
| staging での E2E | [testing/e2e/CONVENTIONS.md](../testing/e2e/CONVENTIONS.md) |
| 運営向けの変更概要資料 | `.claude/skills/release-summary` |

Claude がリリースを進める場合は `.claude/skills/release` に従い、終わったら記録とつまずきを同スキルの `HISTORY.md` に残します。

## 前提

| 環境 | ブランチ | DB（Supabase） | アプリ（Vercel） |
|---|---|---|---|
| dev | 開発ブランチ（都度選ぶ） | blueprint-dev | blueprint-*-dev |
| staging | `staging` | blueprint-stg | blueprint-*-stg |
| 本番 | `main` | blueprint-prod | blueprint-*-prod |

- **マージしてもアプリはデプロイされません**（staging・本番とも Git の接続を外しています）。マージ → DB → 環境変数 → デプロイの順に、手で進めます。
  マージ直後に新しいアプリが出て、DB の変更より先に動き出すのを防ぐためです。
- ブランチの流れ: 開発ブランチ → staging（ステージングPR）→ main（本番PR）。次の開発ブランチは staging から作ります。
- `Deploy` ワークフローの staging・本番は **main のワークフロー定義**で動きます。`.github/workflows/deploy.yml` を変えた場合は、
  リリースより先にその変更だけを main へ入れます（例: #89）。
- `Deploy` は、出すコミットの CI（`ci.yml`）が成功していないと、staging・本番では止まります（失敗・実行中・未実行。dev は警告だけ）。
  マージの直後は、そのマージで動いた CI が終わってから実行します（約2分。`gh run watch` で待てます）。確かめたコミットそのものをデプロイします。
- リリースの状況は `pnpm release:status --env=<dev|staging|prod>` でいつでも確かめられます（読み取りのみ。
  DB のリリーススクリプトの適用状況と、Vercel に出ているコミットがブランチの最新かを表示します）。

## 1. リリース前（開発ブランチ）

- [ ] リリーススクリプトの全セクションを dev に適用済み（`pnpm release:status --env=dev`）。
- [ ] テーブルの正本と dev が一致している（`node supabase/release/schema.mjs --env=dev --check`）。
- [ ] アプリの DB の型と dev が一致している（`node supabase/release/types.mjs --env=dev --check`）。
- [ ] 環境変数の定義の変更を確かめる（`git diff origin/staging -- scripts/vercel-env/manifest.mjs`）。変更があれば、staging・本番の値ファイルを `--init` して値を用意する。
- [ ] 手作業がある場合は、リリーススクリプトの冒頭（【注意】）に書いてある。
- [ ] 画面・業務ルールの変更に合わせて仕様書（`docs/screens/`・`testing/e2e/specs/`）を更新した。
- [ ] 必要なら変更概要資料を作る（release-summary）。

## 2. staging

1. [ ] ステージングPRをマージする（開発ブランチ → `staging`）。
2. [ ] 環境変数の定義が変わった場合だけ: `pnpm vercel-env --env=staging` で差分を確かめ、`--apply`。
   反映した値は次のデプロイから使われる（今動いているアプリは変わらない）ため、DB の適用より前に済ませておく
   （DB の適用からデプロイまでの、旧アプリが失敗しうる時間を短くするため）。
3. [ ] DB のリリーススクリプトを適用する。
   ```bash
   node supabase/release/run.mjs <file> --env=staging --status
   node supabase/release/run.mjs <file> --env=staging --sections=pending
   ```
   - 複数のリリースをまとめて出す場合は、**古いファイルから順に**適用する。
4. [ ] アプリをデプロイする: GitHub の Actions → Deploy → Run workflow（Use workflow from は main、environment は `staging`、アプリは3つとも）。
   ```bash
   gh workflow run deploy.yml -f environment=staging
   ```
   ステージングPRのマージで動いた CI が成功してから実行する（成功していないと止まる）。
5. [ ] `pnpm release:status --env=staging` で「DB・アプリとも反映済み」を確かめる。
6. [ ] 変更した機能を確かめる。E2E は対象を絞って実行する（`-- <ファイル名>` の形は全件が走るため使わない）。
   ```bash
   pnpm --filter @gabby/testing exec cross-env E2E_ENV=staging playwright test <ファイル名の一部> --project=desktop
   ```
7. [ ] E2E を途中で止めた場合は、使い捨てデータの残りを確かめて消す（`pnpm --filter @gabby/testing exec tsx e2e/support/authFixtures.leftovers.ts --env=staging`、消す場合は `--delete`）。

- staging で見つかった不具合は、`origin/staging` から hotfix ブランチ（`feature/YYYYMMDD-hotfix`）を作って直し、staging へ PR を出す。
  開発ブランチは staging へスカッシュマージしているため履歴が分かれており、開発ブランチから出し直すとコンフリクトする。
  同じ修正を次の開発ブランチにも入れる（内容が同じため、次回のマージでぶつからない）。

## 3. 本番

1. [ ] 本番PRをマージする（`staging` → `main`）。
2. [ ] Supabase の**一時トークン**を発行する（権限は `supabase/release/README.md`「アクセストークンの発行」と同じ。作業が終わったら削除する）。
   ファイルには書かず、環境変数で渡す（PowerShell は `$env:SUPABASE_ACCESS_TOKEN = '...'`）。
   ```bash
   export SUPABASE_ACCESS_TOKEN=sbp_...
   ```
3. [ ] 環境変数の定義が変わった場合だけ: `pnpm vercel-env --env=prod`（`prod` の手入力あり）で差分を確かめ、`--apply`。
   staging と同じく、DB の適用より前に済ませておく。
4. [ ] DB のリリーススクリプトを適用する（実行時にプロジェクトの Reference ID の手入力が必要）。
   ```bash
   node supabase/release/run.mjs <file> --env=prod --status
   node supabase/release/run.mjs <file> --env=prod --sections=pending
   node supabase/release/schema.mjs --env=prod --check
   ```
   - staging と同じく、複数のリリースは古いファイルから順に適用する。
5. [ ] アプリをデプロイする: Actions → Deploy（environment は `production`、confirm に `prod`）。
   ```bash
   gh workflow run deploy.yml -f environment=production -f confirm=prod
   ```
   本番PRのマージで動いた CI が成功してから実行する（成功していないと止まる）。
6. [ ] `pnpm release:status --env=prod` で「DB・アプリとも反映済み」を確かめ、各アプリのログイン画面が開くことを確かめる。
7. [ ] 一時トークンを Supabase で削除する。

## 4. リリース後

- [ ] 使い捨てのQAデータの期限は main へのマージまで。残りがあれば一括削除する（`testing/FIXTURES.md`「アカウントの種類と使い分け」）。
- [ ] Claude が進めた場合は、`.claude/skills/release/HISTORY.md` にリリースの記録と、つまずき・手順の改善を残す。

## 5. 切り戻し（リリース後に問題が起きた場合）

まず、問題がアプリだけか、DB の変更にも関わるかを分けます。DB のリリーススクリプトは戻しません（戻すスクリプトは書かない）。

### アプリを前の版に戻す

1. [ ] 戻した後の前の版のアプリが、今の DB で動くかを確かめる。このリリースで列・テーブルの削除、RPC の引数・戻り値の変更をした場合は、
   前の版のアプリは動かないことがあるため、戻さずに直した版を出す（下の「直して前へ進める」）。
2. [ ] すぐに戻す場合: Vercel の画面で対象のプロジェクト（`blueprint-<app>-prod` 等）の Deployments を開き、直前の本番のデプロイで
   **Instant Rollback** を行う。アプリごとに行う。
   - ロールバックの後は、新しい本番のデプロイにドメインが自動で付かなくなる（Vercel の仕様）。直した版を Deploy した後、
     Vercel の画面でその版を本番に Promote し（Promote すると自動の割り当ても元に戻る）、`pnpm release:status --env=prod` で最新のコミットが出ていることを確かめる。
3. [ ] ブランチも戻す場合: 問題のコミットを `git revert` したコミットを `main`（staging なら `staging`）に入れ、CI の成功を待ってから
   Deploy で出し直す（`main` を本番に出ている版と同じに保つ）。

### 直して前へ進める（DB に関わる場合・基本はこちら）

- [ ] DB の不具合は、直す内容を新しいセクションとしてリリーススクリプトに足し、`run.mjs` で適用する（適用済みのセクションは書き換えない）。
- [ ] アプリの不具合は、`origin/main`（staging だけの不具合は `origin/staging`）から hotfix ブランチを作って直し、staging → main の順に入れて通常のリリースの手順で出す（開発ブランチから出し直すとスカッシュマージの履歴の違いでコンフリクトする）。同じ修正を次の開発ブランチにも入れる。急ぐ場合も CI の成功は待つ。
- [ ] 何が起き、どう戻した・直したかを `.claude/skills/release/HISTORY.md` に残す（Claude が進めた場合）。
