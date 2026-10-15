# アプリの環境変数の反映（vercel-env）

admin / student / coach の環境変数を、Vercel の画面で手入力せずにコマンドで反映するツールです。
変数の一覧を Git で管理し、差分を確認してから反映することで、設定漏れ・打ち間違い・アプリ間の値の食い違いを防ぎます。

## 仕組み

| ファイル | Git | 内容 |
|---|---|---|
| `manifest.mjs` | 管理する | 変数の定義（正本）。使うアプリ、環境ごとの値の決め方（値ファイル / 固定値 / URL から決まる値 / 設定しない）、秘密かどうか、形式の検証 |
| `environments.mjs` | 管理する | 環境ごとの接続先（Vercel のプロジェクト・Environment、各アプリの URL、Supabase のプロジェクト） |
| `values/.env.dev`・`values/.env.staging`・`values/.env.prod` | **管理しない** | 値ファイル。秘密の値など、環境ごとに人が決める値だけを書く |
| `values/.state.<env>.json` | 管理しない | 反映した値のハッシュ（Vercel から読み出せない変数があった場合の差分の判定に使う。通常は空） |
| `logs/` | 管理しない | 反映の記録（変数名と操作のみ。値は残さない） |

- URL（`NEXT_PUBLIC_SITE_URL` 等）、送信元、`MAIL_DISPATCH_MODE` などは `manifest.mjs` / `environments.mjs` で決まるため、値ファイルには書きません（書くとエラー）。
- 複数のアプリで使う変数（`MAIL_UNSUBSCRIBE_SECRET` 等）は値ファイルに1回だけ書き、定義に従って各アプリに配ります。
- 変数はすべて Vercel に **encrypted**（Vercel の画面で値を確認できる型）で登録します。Sensitive（登録後は読み出せない型）は使いません。プロジェクトに入れるのは構成管理の担当者だけのため、画面で目視確認できる利便性を優先しています（2026-10-08 決定）。
- 秘密の値（`secret: true`）は、このツールの表示・記録では伏せます（`●●●●（43文字 #3f2a1c）`。`#` 以降は値のハッシュの先頭で、アプリ間で同じ値かを見比べられます）。
- Vercel の連携機能（Axiom 等）が作る変数と、`VERCEL_*` は管理対象外です。
- dev は、手元の起動（`apps/*/.env.local`）と Vercel の dev プロジェクト（`blueprint-*-dev`）が同じ Supabase の dev を使います。`--env=dev --check` は `.env.local`（URL は手元の起動の URL と照合）と、あれば `values/.env.dev` を確かめます。Vercel の dev へのデプロイは下の「Vercel の dev へのデプロイ」。
- 値ファイルは `pnpm env:export`（開発環境の引き継ぎ）の暗号化アーカイブに含まれます。

## 初回準備

### Vercel のアクセストークン

Vercel の **Account Settings → Tokens → Create Token** で発行します。

| 項目 | 設定 |
|---|---|
| Scope | チーム（blueprint のプロジェクトがあるチーム） |
| Expiration | 必要な期間だけ（期限切れになったら再発行） |

- dev・staging の値ファイルの `VERCEL_TOKEN` に書きます。**本番の値ファイルは空欄**にし、実行時に入力します（入力内容は表示されません）。
- 環境変数 `VERCEL_TOKEN` でも渡せます。
- チャット・チケット等に貼った場合は、すぐに Vercel で削除して発行し直してください。

### 値ファイルの作成

既に Vercel に設定がある環境は、現在の値から作ります（値は画面に表示しません。定義に無い変数は一覧で表示します）。

```bash
pnpm vercel-env --env=staging --pull
```

新しく作る場合や、定義に変数が増えた場合は `--init` を使います（既存の値は残し、不足分を追記します。`generate: true` の変数はランダムな値を作ります）。
dev の `--init` は、空欄の必須の値を `apps/*/.env.local` から写します（任意の値＝検証用の上書き等は写しません）。

```bash
pnpm vercel-env --env=staging --init
```

## 使い方

リポジトリ直下で実行します。

```bash
pnpm vercel-env --env=staging --check     # 値ファイルの検証のみ（Vercel に接続しない）
pnpm vercel-env --env=staging             # 差分の表示のみ（変更しない）
pnpm vercel-env --env=staging --apply     # 差分を表示し、確認のうえ反映
```

差分の表示の例:

```
== admin → blueprint-admin-stg（production）
  + 追加　　 CRON_SECRET                                ●●●●（43文字 #3f2a1c）
  ~ 変更　　 NEXT_PUBLIC_SITE_URL                       "http://blueprint-student-stg.vercel.app" → "https://blueprint-admin-stg.vercel.app"
  - 削除　　 OLD_FEATURE_FLAG                           廃止した変数
  ? 管理外　 SOMETHING                                  定義に無い変数
  変更なし 14件
```

| 表示 | 意味 |
|---|---|
| `+ 追加` | Vercel に無い変数を登録する |
| `~ 変更` | 値を変える。「読み出せないため上書き」は Sensitive で登録されていて前回の値が手元に記録されていないもの（同じ値でも上書きする） |
| `~ 作り直し` | Sensitive で登録されているため、削除して encrypted で登録し直す |
| `- 削除` | この環境では設定しない定義・このアプリでは使わない定義・廃止した変数。他の Environment（preview 等）と共有している場合は、対象の Environment から外すだけ |
| `? 管理外` | 定義に無い変数。表示するだけで変更しない（`--prune` を付けると削除する） |

- 本番は反映前に `prod` の手入力を求めます。
- 反映した環境変数は**次のデプロイから**使われます。反映後に表示されるアプリを再デプロイしてください（`NEXT_PUBLIC_*` はビルドに埋め込まれるため、再デプロイしないと変わりません）。
- 途中で失敗した場合は、原因を直して同じコマンドを再実行すると、残りの差分だけを反映します。

その他のコマンド:

```bash
pnpm vercel-env --env=staging --apps=admin            # 対象のアプリを絞る
pnpm vercel-env --env=staging --write-app-env         # apps/*/.env.staging（テスト等が読む控え）を値ファイルから作り直す
pnpm vercel-env --env=dev --check                     # apps/*/.env.local（と values/.env.dev）が定義どおりか確かめる
pnpm vercel-env --write-examples                      # apps/*/.env.example を定義から作り直す
pnpm test:vercel-env                                  # 単体テスト
```

## Vercel の dev へのデプロイ

開発中のブランチを、staging より前に固定の URL で確認するための環境です（代理ログイン・アプリ間のリンク・メールのリンク等、preview の一時的な URL では確かめられない機能の確認用）。

| アプリ | URL | プロジェクト |
|---|---|---|
| admin | https://blueprint-admin-dev.vercel.app | blueprint-admin-dev |
| student | https://blueprint-student-dev.vercel.app | blueprint-student-dev |
| coach | https://blueprint-coach-dev.vercel.app | blueprint-coach-dev |

- Git 連携はしていません。push・PR・マージでは動かず、GitHub Actions の `Deploy to dev`（`.github/workflows/deploy-dev.yml`）を手動で実行した時だけデプロイします。
- DB は Supabase の dev（手元の起動と同じ）です。メールは dev と同じく許可リストのドメインにだけ送ります。
- dev の枠は1つです。後から実行した方が反映されるため、複数の開発が並行する場合は一声かけてから実行してください。

### 実行のしかた

GitHub の **Actions → Deploy to dev → Run workflow** で、ブランチ（例 `feature/20261015-dev`）を入力し、アプリにチェックを付けて実行します。コマンドの場合:

```bash
gh workflow run deploy-dev.yml -f ref=feature/20261015-dev -f student=true -f admin=true
```

- 指定したブランチは push 済みである必要があります（GitHub 上のコミットをデプロイします。手元の未コミットの変更・`.env.local` は含まれません）。
- 実行結果の画面（Summary）に、アプリ・ブランチ・コミット・実行者が残ります。
- 「Run workflow」のボタンは、ワークフローのファイルが main に入るまで GitHub の画面に出ません。

### 前提（初回のみ）

1. dev の環境変数を反映する: `pnpm vercel-env --env=dev --init` → `pnpm vercel-env --env=dev --apply`。定義を変えた・`.env.local` の値を変えた時も同じく `--apply` してから、ワークフローでデプロイし直します。
2. Vercel のトークンを発行し、リポジトリの Secrets に `VERCEL_BLUEPRINT_TOKEN` として登録する（`gh secret set VERCEL_BLUEPRINT_TOKEN`）。
- Supabase の Authentication の Redirect URLs への登録は不要です（招待・パスワード再設定・代理ログインは、アプリが自分の URL でリンクを作り、サーバー側の `verifyOtp` で確かめるため。staging・本番も未登録）。

## よくある作業

### 変数を追加する（開発者）

1. `manifest.mjs` に定義を追加する（使うアプリ・環境ごとの値の決め方・説明・秘密かどうか・検証）。
2. `pnpm vercel-env --write-examples` で `apps/*/.env.example` を作り直す。
3. 手元の `apps/*/.env.local` に値を書き、`pnpm vercel-env --env=dev --check` で確かめる。
4. 1・2 をブランチに含めてコミットする。
5. リリース時に、staging・本番で `--init`（値ファイルで決める変数の場合）→ 値を記入 → `--apply`。

### 値を変える

- 値ファイルで決める変数: `values/.env.<env>` を書き換えて `--apply`。
- 固定値・URL: `manifest.mjs` / `environments.mjs` を変更してコミットし、`--apply`。

### 変数を廃止する

`manifest.mjs` の定義に `removed: true` を付けます（定義を消すと「管理外」になり、自動では削除されません）。
全環境から削除し終えたら、定義を消してかまいません。

### CRON_SECRET を変えたとき

DB（pg_cron）から送信処理を呼ぶ鍵のため、その環境の Supabase の SQL エディタで Vault も同じ値にします。

```sql
SELECT id, name FROM vault.secrets WHERE name = 'mail_dispatch_secret';
SELECT vault.update_secret('<id>', '<新しい CRON_SECRET>');
```

admin の再デプロイと Vault の更新の間は、送信処理の呼び出しが 401 になります（送信待ちに残り、更新後に送られます）。
