# リリーススクリプトの適用手順

`supabase/release/*.sql` を dev / staging / prod に適用する手順です。
SQLエディタへの貼り付けではなく、実行ツール `run.mjs` を使います。実行先の取り違え、
適用後作業（データ移行スクリプト等）の実行漏れ、同じセクションの二重適用を防ぐためです。

## 初回準備

### 1. アクセストークンの発行

ダッシュボード右上のアカウント > Access Tokens で、次の設定のトークンを発行します。
1つのトークンで dev / staging / prod のすべてに使えます。

| 項目 | 設定 |
|---|---|
| Resource access | 組織 `GabbyAcademy Free` と `GabbyAcademy Prod` |
| Permissions | プリセットは使わず、**Database: Read-write** と **Project Settings: Read** のみ（他はすべて None） |
| 有効期限 | 必要な期間だけ（期限切れになったら再発行） |

- Database: Read-write … SQLの実行（`POST /v1/projects/{ref}/database/query`）に必要です。
- Project Settings: Read … 接続先プロジェクト名の確認（`GET /v1/projects/{ref}`）に必要です。
- Full Access は不要です。漏洩時の影響を抑えるため、上記以外の権限は付けないでください。

### 2. 環境ファイルの作成

`env/.env.example` をコピーして、`env/.env.dev`・`env/.env.staging`・`env/.env.prod` を作成します
（いずれも Git 管理外です）。

| キー | 値 |
|---|---|
| `SUPABASE_PROJECT_REF` | dev=`vihincuxiizavuxoctul` / staging=`vodmgorcugymrpdmdqkg` / prod=`xzoefwwzminkqqzbhtwq` |
| `SUPABASE_ACCESS_TOKEN` | 1で発行したトークン |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | `apps/*/.env.local`（dev）/ `apps/*/.env.staging`（staging）と同じ値。prod はダッシュボードで確認 |

- `.env.prod` の `SUPABASE_ACCESS_TOKEN` は**空欄を推奨**します。空欄の場合は実行時に入力を求められます。

### 3. 既存の適用分を記録する（環境ごとに1回）

`run.mjs` 導入前に SQL エディタで適用済みのセクションは、適用履歴に記録がありません。
そのままでは「未適用」と判定されるため、SQL を実行せずに「適用済み」として記録します。

```bash
node supabase/release/run.mjs 20260919_feature-20260918-dev_release.sql --env=dev --mark-applied=all
```

過去のリリースファイル（本ファイル導入前に本番反映済みのもの）は記録不要です。
`--status` で「未適用」と表示されますが、再適用しないでください。

## 実行手順

リポジトリ直下で実行します。

```bash
# 1. セクション一覧と適用後作業を確認（DBには接続しません）
node supabase/release/run.mjs 20260919_feature-20260918-dev_release.sql --list

# 2. 環境ごとの適用状況を確認（未適用 / 適用済み / 適用後に内容変更あり）
node supabase/release/run.mjs 20260919_feature-20260918-dev_release.sql --env=staging --status

# 3. staging で予行演習（未適用のセクションをすべて適用）
node supabase/release/run.mjs 20260919_feature-20260918-dev_release.sql --env=staging --sections=pending

# 4. 本番に適用
node supabase/release/run.mjs 20260919_feature-20260918-dev_release.sql --env=prod --sections=pending

# （開発中に dev へ追加したセクションだけ反映する場合）
node supabase/release/run.mjs 20260919_feature-20260918-dev_release.sql --env=dev --sections=pending
```

### オプション

| オプション | 内容 |
|---|---|
| `--list` | セクション一覧と適用後作業を表示（DB接続なし） |
| `--status` | 接続先環境での適用状況を表示 |
| `--sections=pending` / `all` / `1,3` | 実行するセクション。セクションが複数あるファイルでは必須 |
| `--mark-applied=all` / `1,3` | SQLを実行せず「適用済み」として記録のみ |
| `--reapply` | 適用済みセクションの再実行を許可（冪等なセクションを意図的に再実行する場合のみ） |
| `--skip-post` | 適用後作業（@post）を実行しない |

### 実行時の流れ

1. 環境ファイルを読み込み、次のいずれかに該当すれば実行せずに中止します。
   - `SUPABASE_URL` と `SUPABASE_PROJECT_REF` が一致しない
   - プロジェクト名が `--env` と対応しない（`dev` / `stg` / `prod` を含まない）
   - 対象に適用済みのセクションが含まれる（`--reapply` 指定時を除く）
2. 実行計画（環境・プロジェクト名・ファイルのハッシュ・対象セクションと現在の状態・適用後作業）を表示します。
3. 確認を求めます。prod の場合は、プロジェクトの Reference ID を手入力しないと進めません。
4. セクションを1つずつ実行し、成功したら適用履歴に記録します。
   エラーになったセクションはロールバックされ（失敗として記録）、それ以降は実行しません。
5. 各セクションの `-- @post:` に書かれた適用後作業を、1件ずつ確認を挟んで実行し、結果を記録します。
   - `y` で実行、`s` でスキップ、それ以外で中止します。
   - dry-run の出力を確認してから、反映コマンドを実行してください。
6. 実行結果は `logs/`（Git 管理外）にも JSON で保存されます。

### 適用履歴（ops.release_history）

- 各環境のDBの `ops.release_history` に、セクション・適用後作業ごとの結果（実行者・コミット・日時）を記録します。
  テーブルは `run.mjs` が初回実行時に自動作成します（正本: `supabase/DDL/table/ops_release_history.sql`）。
- `ops` スキーマは API に公開せず、anon / authenticated からは参照できません。
- セクション本文のハッシュも記録しているため、適用後にセクションを書き換えると `--status` で
  「適用後に内容変更あり」と表示されます。適用済みのセクションは書き換えず、修正は新しいセクションとして追加してください。

## リリーススクリプトの書き方（run.mjs が解釈する規約）

- **セクション**：ファイル先頭をセクション1とし、以降は次の形のヘッダーで区切ります
  （`-- ====` 行の直後の行に `【追加セクション】` を含める）。各セクションは `BEGIN;` 〜 `COMMIT;` で完結させます。
  セクション番号で適用履歴を管理するため、**既存セクションの間に挿入せず、必ず末尾に追加**してください。

  ```sql
  -- =========================================================================
  -- 【追加セクション】<タイトル>
  -- 追加日: YYYY-MM-DD
  ```

- **適用後作業**：SQLだけでは完結しない作業（Storage からのデータ移行等）は、そのセクション内に
  `-- @post: <コマンド>` として実行順に記載します。コマンドはリポジトリ直下で実行され、
  環境変数 `SUPABASE_URL`（`NEXT_PUBLIC_SUPABASE_URL` にも同じ値を設定）と `SUPABASE_SERVICE_ROLE_KEY` が渡されます。
  - dry-run と反映の2段階にできるスクリプトは、2行に分けて記載します
    （例: `20260919_feature-20260918-dev_release.sql` のセクション8）。
  - スクリプトは再実行しても安全（冪等）に作ってください。
