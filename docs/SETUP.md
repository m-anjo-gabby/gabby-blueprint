# 開発環境セットアップ手順（Windows）

新しい端末で `gabby-blueprint` の開発を始めるための手順です。
バックエンドは Supabase の dev プロジェクトを共用するため、Docker やローカルの Supabase は使いません。
**VSCode とブラウザ（＋ Node.js / Git）** があれば開発できます。

所要時間の目安: 30〜60分（`pnpm install` とブラウザのダウンロードを含む）

## 全体像

| 区分 | 内容 | 入手方法 |
|---|---|---|
| ツール | Git / Node.js / pnpm / mkcert / VSCode | 各自インストール（手順1） |
| ソース | GitHub `m-anjo-gabby/gabby-blueprint` | clone（手順2） |
| 環境ファイル | `apps/*/.env.local` など（Git管理外・シークレット） | 既存端末からコピー、または担当者から受領（手順4） |
| 証明書 | `apps/*/certificates/*.pem`（Git管理外） | 端末ごとに mkcert で生成（手順5）。**コピーしない** |
| アカウント | GitHub / Supabase ダッシュボード / dev のログインユーザー | 担当者に招待を依頼（手順0） |

## 自分の別端末に環境を移す場合（ツールで一括）

既存の端末があり、同じアカウント（GitHub / Supabase / Claude）で作業する場合は、
`scripts/dev-env/` のツールで手順1〜9をまとめて実行できます（手動手順は下の各章を参照）。

**既存の端末で:**

```powershell
pnpm env:export                        # 出力先はデスクトップ
pnpm env:export -- -OutDir D:\transfer # 出力先を指定する場合
```

- 手順4の環境ファイル、Vercel の紐づけ（`.vercel/`）、`.github/`、Claude Code のメモリを、パスワード付きの暗号化アーカイブ（`gabby-dev-env.gbenv`）にまとめます。
  対象は `scripts/dev-env/DevEnvCommon.ps1` の `$DevEnvRepoAssets` で定義しています。一覧にない Git 管理外ファイルがあれば警告が出るので、必要なら一覧に追加してください。
- 別端末では GitHub から clone するため、コミットしていない変更や push していないコミットがあると警告が出ます。先に push してください。
- 出力フォルダ `gabby-dev-env-<日時>` には、アーカイブとセットアップツール（`setup.cmd` ほか）が入ります。

**新しい端末で:**

1. 出力フォルダを USB メモリや個人のクラウドストレージでコピーする
2. フォルダ内の `setup.cmd` をダブルクリックし、パスワードを入力して画面の指示に従う
3. 終わったら、コピーに使った媒体からフォルダを削除する

`setup.cmd` は次の順に進めます。済んでいる手順は自動でスキップするため、途中で止まっても再実行すれば続きから進められます。

| 順 | 内容 | 対応する手動手順 |
|---|---|---|
| 1 | Git / Node.js / mkcert / VSCode を winget でインストール | 手順1 |
| 2 | Git の設定（`core.autocrlf=input`・`core.longpaths=true`・名前とメール） | 手順1 |
| 3 | clone と作業ブランチへの切り替え（配置先はエクスポート元と同じパスが既定） | 手順2 |
| 4 | pnpm のインストールと `pnpm install --frozen-lockfile` | 手順1・3 |
| 5 | 環境ファイル等の展開（既存のファイルと内容が違う場合は上書きを確認） | 手順4 |
| 6 | Claude Code のメモリの展開 | 手順8 |
| 7 | mkcert によるローカルHTTPS証明書の作成 | 手順5 |
| 8 | VSCode の推奨拡張機能のインストール | 手順7 |
| 9 | Playwright のブラウザ取得（任意） | 手順9 |

完了後、手順6の動作確認と、VSCode の Claude Code へのサインインを行ってください。

## 0. 事前に用意するアカウント・権限

- **GitHub**: リポジトリ `m-anjo-gabby/gabby-blueprint` への Collaborator 権限
- **Supabase ダッシュボード**（任意）: SQLエディタでの確認やリリース作業をする場合のみ。組織 `GabbyAcademy Free`（dev/staging）への招待
- **dev のログインユーザー**: 画面確認用の admin / coach / student アカウント。新規メンバーは admin の招待機能で作成してもらう
- **Claude Code**（任意）: 利用する場合は Anthropic アカウント

## 1. ツールのインストール

PowerShell で実行します（winget は Windows 11 標準）。

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e      # Node.js 24 LTS（package.json の engines は >=20.10）
winget install --id FiloSottile.mkcert -e     # ローカルHTTPS用の証明書作成ツール
winget install --id Microsoft.VisualStudioCode -e
```

インストール後、**PowerShell を開き直して**から pnpm を有効化します。
pnpm のバージョンは `package.json` の `packageManager`（`pnpm@9.15.0`）に固定されています。

```powershell
corepack enable          # 失敗する場合（権限エラー等）は: npm install -g pnpm@9.15.0
pnpm -v                  # 9.15.0 と表示されればOK
```

### Git の改行コード設定（clone 前に必ず実施）

リポジトリには `.gitattributes` がなく、改行コードは LF で管理しています。
Git for Windows の既定（`autocrlf=true`）のままだと作業コピーが CRLF になり、差分が大量に出るため、clone 前に設定します。

```powershell
git config --global core.autocrlf input
git config --global core.longpaths true   # node_modules の長いパスで「Filename too long」にならないように
git config --global user.name  "<名前>"
git config --global user.email "<メールアドレス>"
```

## 2. ソースの取得

**`C:\react\gabby-blueprint` に clone することを推奨します。**
Claude Code のメモリ（手順8）がフォルダパス単位で保存されるため、既存端末とパスを揃えると引き継ぎが楽です。

```powershell
mkdir C:\react -Force
cd C:\react
git clone https://github.com/m-anjo-gabby/gabby-blueprint.git
cd gabby-blueprint
git switch <作業ブランチ>     # 例: feature/20260925-dev
```

初回の push/pull でブラウザが開き、GitHub へのサインインを求められます（Git Credential Manager）。

## 3. 依存パッケージのインストール

リポジトリ直下で実行します（`apps/*`・`packages/*`・`testing` がまとめて入ります）。

```powershell
pnpm install
```

## 4. 環境ファイルの配置

シークレットを含むファイルは Git 管理外です。既存端末からコピーするか、担当者から受け取ってください。
**受け渡しはパスワードマネージャーや暗号化した媒体で行い、チャットやメールに平文で貼らないでください。**

| ファイル | 必須 | 用途 |
|---|---|---|
| `apps/admin/.env.local` | ○ | admin の dev 接続 |
| `apps/coach/.env.local` | ○ | coach の dev 接続 |
| `apps/student/.env.local` | ○ | student の dev 接続（E2E もここから Supabase 接続情報を読む） |
| `testing/.env.local` | E2E を実行する場合 | QAアカウントのパスワード等（`testing/.env.example` 参照） |
| `apps/*/.env.staging` | staging でテストする場合 | staging 接続 |
| `supabase/release/env/.env.dev` など | リリース作業をする場合 | `supabase/release/README.md` の「初回準備」参照。アクセストークンは端末ごとに発行し直してもよい |

- キーの一覧と意味は各フォルダの `.env.example` を参照してください。
- 各アプリの URL はローカルの HTTPS に合わせて次の値にします（既存端末からコピーした場合はそのままで可）。

  | キー | 値 |
  |---|---|
  | student `NEXT_PUBLIC_SITE_URL` | `https://localhost:3000` |
  | admin `NEXT_PUBLIC_SITE_URL` | `https://localhost:3001` |
  | coach `NEXT_PUBLIC_SITE_URL` | `https://localhost:3002` |
  | admin `NEXT_PUBLIC_STUDENT_URL` / `NEXT_PUBLIC_COACH_URL` | `https://localhost:3000` / `https://localhost:3002` |

- **リポジトリ直下の `.env.local` は古いプロジェクトを指しているため使いません**（コピーも不要です）。
- `temp_data/` など本番データを含むフォルダは端末間でコピーしないでください。

## 5. ローカルHTTPS証明書の作成

dev サーバーは `dev:ssl`（`https://localhost:300x`）で起動し、証明書を `apps/<app>/certificates/` から読み込みます。
証明書は端末ごとに作成します（他の端末の証明書はその端末のルートCAでしか信頼されないため、コピーしても警告が出ます）。

```powershell
mkcert -install     # ローカルのルートCAを作成してWindowsに登録（初回のみ。確認ダイアログは「はい」）

foreach ($app in "admin", "coach", "student") {
  New-Item -ItemType Directory -Force "apps\$app\certificates" | Out-Null
  mkcert -key-file "apps\$app\certificates\localhost-key.pem" `
         -cert-file "apps\$app\certificates\localhost.pem" `
         localhost 127.0.0.1 ::1
}
```

`*.pem` は `.gitignore` 済みです。Firefox を使う場合は、Firefox を閉じた状態で `mkcert -install` を再実行してください。

## 6. 起動と動作確認

```powershell
pnpm dev:ssl                                        # 3アプリをまとめて起動（turbo）
pnpm --filter gabby-blueprint-student run dev:ssl   # 1アプリだけ起動する場合
```

| アプリ | URL |
|---|---|
| student | https://localhost:3000 |
| admin | https://localhost:3001 |
| coach | https://localhost:3002 |

確認ポイント:

1. ブラウザで証明書の警告が出ない（出る場合は手順5の `mkcert -install` を確認）
2. 各アプリのログイン画面で、dev のアカウントでログインできる
3. student の単語帳などで音声再生（Azure Speech）が動く

停止は `Ctrl + C` です。停止後もポートが使用中のままになる場合は、次のコマンドでプロセスを終了します。

```powershell
Get-NetTCPConnection -LocalPort 3000,3001,3002 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## 7. VSCode の設定

リポジトリを開くと、推奨拡張機能（`.vscode/extensions.json`）のインストールを促す通知が出ます。すべてインストールしてください。

| 拡張機能 | 用途 |
|---|---|
| ESLint | Lint 表示 |
| Prettier | 整形 |
| Tailwind CSS IntelliSense | クラス名の補完 |
| Claude Code | AI による開発支援（任意） |
| Japanese Language Pack | VSCode の日本語化（任意） |

変更後のチェックは次のとおりです（`CLAUDE.md` の完了条件）。

```powershell
pnpm --filter gabby-blueprint-student exec tsc --noEmit
pnpm --filter gabby-blueprint-student exec eslint <変更したファイル>
```

## 8. Claude Code（任意）

- プロジェクトの規約は `CLAUDE.md`、共有スキルは `.claude/skills/` にあり、clone するだけで有効になります。
- **メモリ（過去の作業で蓄積した判断・経緯）は端末のユーザーフォルダに保存され、Git では共有されません。**
  既存端末と同じ作業を続ける場合は、次のフォルダを丸ごとコピーしてください。

  ```
  %USERPROFILE%\.claude\projects\c--react-gabby-blueprint\memory\
  ```

  フォルダ名 `c--react-gabby-blueprint` は clone 先のパス（`c:\react\gabby-blueprint`）から決まります。
  別のパスに clone した場合は、VSCode で一度 Claude Code を起動して作成されたフォルダ名に合わせてコピーしてください。
  新規メンバーの場合はコピー不要です（個人の作業メモのため）。

## 9. E2E テスト（任意）

Playwright のブラウザを取得します（初回と Playwright の更新時のみ）。
実行方法とルールは `testing/e2e/CONVENTIONS.md` を参照してください。

```powershell
pnpm --filter @gabby/testing exec playwright install chromium webkit
```

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `dev:ssl` 起動時に `localhost-key.pem` が見つからないエラー | 手順5の証明書作成を実施 |
| ブラウザで「この接続ではプライバシーが保護されません」 | `mkcert -install` を実行してブラウザを再起動 |
| ログイン後に別のポート／本番URLへ飛ぶ | `.env.local` の `NEXT_PUBLIC_*_URL` を手順4の値に修正して再起動 |
| `git status` に触っていないファイルが大量に出る | 改行コードの問題。`git config --global core.autocrlf input` を設定して clone し直す |
| `pnpm` が見つからない | PowerShell を開き直す。解決しない場合は `npm install -g pnpm@9.15.0` |
| ポート 3000〜3002 が使用中 | 手順6のプロセス終了コマンドを実行 |
