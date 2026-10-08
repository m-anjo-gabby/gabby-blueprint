# アプリの環境変数の反映（vercel-env）

admin / student / coach の環境変数を、Vercel の画面で手入力せずにコマンドで反映するツールです。
変数の一覧を Git で管理し、差分を確認してから反映することで、設定漏れ・打ち間違い・アプリ間の値の食い違いを防ぎます。

## 仕組み

| ファイル | Git | 内容 |
|---|---|---|
| `manifest.mjs` | 管理する | 変数の定義（正本）。使うアプリ、環境ごとの値の決め方（値ファイル / 固定値 / URL から決まる値 / 設定しない）、秘密かどうか、形式の検証 |
| `environments.mjs` | 管理する | 環境ごとの接続先（Vercel のプロジェクト・Environment、各アプリの URL、Supabase のプロジェクト） |
| `values/.env.staging`・`values/.env.prod` | **管理しない** | 値ファイル。秘密の値など、環境ごとに人が決める値だけを書く |
| `values/.state.<env>.json` | 管理しない | 反映した値のハッシュ（Vercel から読み出せない変数があった場合の差分の判定に使う。通常は空） |
| `logs/` | 管理しない | 反映の記録（変数名と操作のみ。値は残さない） |

- URL（`NEXT_PUBLIC_SITE_URL` 等）、送信元、`MAIL_DISPATCH_MODE` などは `manifest.mjs` / `environments.mjs` で決まるため、値ファイルには書きません（書くとエラー）。
- 複数のアプリで使う変数（`MAIL_UNSUBSCRIBE_SECRET` 等）は値ファイルに1回だけ書き、定義に従って各アプリに配ります。
- 変数はすべて Vercel に **encrypted**（Vercel の画面で値を確認できる型）で登録します。Sensitive（登録後は読み出せない型）は使いません。プロジェクトに入れるのは構成管理の担当者だけのため、画面で目視確認できる利便性を優先しています（2026-10-08 決定）。
- 秘密の値（`secret: true`）は、このツールの表示・記録では伏せます（`●●●●（43文字 #3f2a1c）`。`#` 以降は値のハッシュの先頭で、アプリ間で同じ値かを見比べられます）。
- Vercel の連携機能（Axiom 等）が作る変数と、`VERCEL_*` は管理対象外です。
- dev は Vercel に反映しません。`--check` で `apps/*/.env.local` が定義どおりかを確かめるだけです。
- 値ファイルは `pnpm env:export`（開発環境の引き継ぎ）の暗号化アーカイブに含まれます。

## 初回準備

### Vercel のアクセストークン

Vercel の **Account Settings → Tokens → Create Token** で発行します。

| 項目 | 設定 |
|---|---|
| Scope | チーム（blueprint のプロジェクトがあるチーム） |
| Expiration | 必要な期間だけ（期限切れになったら再発行） |

- staging の値ファイルの `VERCEL_TOKEN` に書きます。**本番の値ファイルは空欄**にし、実行時に入力します（入力内容は表示されません）。
- 環境変数 `VERCEL_TOKEN` でも渡せます。
- チャット・チケット等に貼った場合は、すぐに Vercel で削除して発行し直してください。

### 値ファイルの作成

既に Vercel に設定がある環境は、現在の値から作ります（値は画面に表示しません。定義に無い変数は一覧で表示します）。

```bash
pnpm vercel-env --env=staging --pull
```

新しく作る場合や、定義に変数が増えた場合は `--init` を使います（既存の値は残し、不足分を追記します。`generate: true` の変数はランダムな値を作ります）。

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
pnpm vercel-env --env=dev --check                     # apps/*/.env.local が定義どおりか確かめる
pnpm vercel-env --write-examples                      # apps/*/.env.example を定義から作り直す
pnpm test:vercel-env                                  # 単体テスト
```

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
