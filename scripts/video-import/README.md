# 旧システムのビデオの取り込み

旧システム（S3 の `video-pd/` の runnow / on-demand / cvc）のビデオ194本を、ビデオ教材（`com_m_contents` の content_type=1 ＋ `com_m_video_section` / `com_m_video`）として取り込むツールです。

## 何をどこに置くか

| | dev・staging | 本番 |
|---|---|---|
| 教材・セクション・並び順・タイトル | 3環境で同じ（`catalog.json`） | 同左 |
| 動画 | 切り出し（10秒の地点から3秒。動画が13秒未満なら先頭から。360p・モノラル。1本 100KB 未満） | 実物 |
| サムネイル | 旧システムの画像を WebP にしたもの（解像度はそのまま、幅は 1280px まで） | 同左 |

- 実物を本番だけに置くのは、3環境分の実物（元のファイルで約7GB。再エンコード後も1環境で数GB）が R2 の無料枠（10GB）に入らないためです。
- 本番の実物は、映像が 0.9Mbps を超える、または 720p を超える動画だけ再エンコードします（720p・H.264 CRF 26・AAC 128kbps・faststart）。それ以下の動画は画質を落とさないよう元のまま置きます。
- 教材は非公開（status 0）で作ります。ビデオは公開（status 1）で作り、公開・非公開は教材の単位で決めます。admin のプレビューで確かめてから、教材を公開してください。
- `duration_sec` は置いたファイルから測ります（dev・staging は 3秒）。

## catalog.json（取り込む構成の正本）

旧マスタ（`gabby.COM_M_VIDEO.tsv`、194行）と割り当て表（`20230309_G4.0_RunNow_ビデオ割り当て.xlsx`）から一度だけ作った定義です。取り込みの後は、教材名・並び順の変更等は admin で行います（このファイルを直して再実行しても、取り込み済みの行は書き換えません）。

- Foundational 1〜4 / Personalized 1〜4: 割り当て表の CATEGORY を教材、SUB-CATEGORY をセクションにしています。
  - 旧マスタにあって割り当て表に無い P-1-1-6 は、番号どおり 1.1 の P-1-1-5 の後に置いています。
  - 割り当て表にあってファイルの無い P-3-2-1・P-3-2-2 は除いています（P-3 のセクション「3.2」は作りません）。
- S-1〜S-4: 見出しの無いセクション1つ。番号の順（旧マスタの SORTNO の順ではありません）。
- on-demand: Logical Dialogue（セクション Unit 1〜4）・時制・発音 R・L。cvc: ColorVowel 入門。
- 名前は教材（`name` / `nameEn`）・セクション（`name` / `nameEn`）・ビデオ（`title` / `titleEn`）とも和名・英名の組で持ち、教材とビデオには説明（`description`。生徒だけに見せるため和文だけ）も持ちます。英名はコーチ向けの画面で使います。
  - 旧システムには和名・説明が無かったため、和名・説明は旧タイトルから推測して付けたものです（Color Vowel の用語は英語のまま）。旧タイトルが日本語の Logical Dialogue だけは、旧タイトルを和名にし、英名を推測で付けています。
  - 旧タイトルは `legacyTitle` に残しています（`&quot;` は `"` に戻しています。英名は旧タイトルの綴りの誤りを直したもの）。
  - `note` は運営に確かめてほしいこと（同じタイトルの F-2-1-2〜4、同じ文の S-2-8 と S-2-21、欠番等）で、取り込みには使いません。
- ペア（`pairWithNext`。今日のメニューで次のビデオと2本を同じ日に割り当てる）は、旧システムのメニューのマスタ（`gabby.COM_M_RUNNOW_VIDEO.tsv` の `PAIR_TYPE` / `PAIR_ID`）から付けています。組の1本目に `true` を持ちます。
  - 割り当て表とマスタで組が違う P-2-1-17〜P-2-2-1 は、マスタ（17＋18、19＋P-2-2-1）に合わせています。
  - マスタで教材をまたぐ F-1-4-4＋F-2-1-1 は、教材をまたぐ組を持たないため、どちらもシングルにしています。
  - マスタでメニューから外されていた P-4-4-1・P-4-4-2（kazoo）もペアにしています（メニューの対象は発音トレーニングのすべてのビデオ）。
- 名前・説明は、運営の確認（共有ドライブの「ビデオ教材 確認表」）の回答を反映してから本番に取り込みます。

突き合わせのキーは、教材 = `content_label`（`VIDEO_F1` 等）、セクション = 教材と見出し、ビデオ = `legacy_code`（旧ファイル名）です。途中で止まっても、再実行すれば続きから取り込みます。

## 準備

- ffmpeg（`winget install --id Gyan.FFmpeg -e`）。PATH に無い場合は環境変数 `FFMPEG_DIR` に `ffmpeg.exe` のあるフォルダを指定します。
- 旧システムのビデオを落としたフォルダ（例: `D:\work\video`。`runnow/`・`on-demand/`・`cvc/` とその `thumbnail/`）。
- 接続先は `supabase/release/env/.env.<env>` の `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`（リリーススクリプトと同じファイル）。

## 実行

リポジトリ直下で実行します。

```bash
# 1. 計画の表示（DB は読むだけ）
pnpm video-import --env=dev --src=D:/work/video

# 2. 置くファイルを作る（DB に接続しない。<src>/_build に作り、次からは使い回す）
pnpm video-import --env=dev --src=D:/work/video --prepare

# 3. 取り込む（確認のうえ実行。staging・本番は環境名の入力を求める）
pnpm video-import --env=dev --src=D:/work/video --apply
```

| オプション | 内容 |
|---|---|
| `--only=VIDEO_LD,VIDEO_CVC` | 対象の教材をラベルで絞る |
| `--work=<dir>` | 作ったファイルの置き場所（既定は `<src>/_build`。`clip/`・`full/`・`thumb/`） |

本番の実物の再エンコードは1時間ほどかかるため、先に `--env=prod --prepare` で作っておくと取り込みが早く終わります。

## 置き場所

ファイルはアプリ（`packages/lib/video/storage.ts`）と同じ R2 のバケットに置きます。バケット（`blueprint-video-dev` / `-stg` / `-prod`）は環境変数の定義（`scripts/vercel-env/manifest.mjs` の `R2_VIDEO_BUCKET`）で決まります。鍵（`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`）は、dev は `apps/admin/.env.local`、staging・本番は環境変数の値ファイル（`scripts/vercel-env/values/.env.<env>`）から読みます。
