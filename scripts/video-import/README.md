# 旧システムのビデオの取り込み

旧システム（S3 の `video-pd/` の runnow / on-demand / cvc）のビデオ194本を、ビデオ教材（`com_m_contents` の content_type=1 ＋ `com_m_video_section` / `com_m_video`）として取り込むツールです。

## 何をどこに置くか

| | dev・staging | 本番 |
|---|---|---|
| 教材・区切り・並び順・タイトル | 3環境で同じ（`catalog.json`） | 同左 |
| 動画 | 切り出し（10秒の地点から3秒。動画が13秒未満なら先頭から。360p・モノラル。1本 100KB 未満） | 実物 |
| サムネイル | 旧システムの画像を WebP にしたもの（解像度はそのまま、幅は 1280px まで） | 同左 |

- 実物を本番だけに置くのは、3環境分の実物（元のファイルで約7GB。再エンコード後も1環境で数GB）が R2 の無料枠（10GB）に入らないためです。
- 本番の実物は、映像が 0.9Mbps を超える、または 720p を超える動画だけ再エンコードします（720p・H.264 CRF 26・AAC 128kbps・faststart）。それ以下の動画は画質を落とさないよう元のまま置きます。
- 教材は非公開（status 0）で作ります。ビデオは公開（status 1）で作り、公開・非公開は教材の単位で決めます。admin のプレビューで確かめてから、教材を公開してください。
- `duration_sec` は置いたファイルから測ります（dev・staging は 3秒）。

## catalog.json（取り込む構成の正本）

旧マスタ（`gabby.COM_M_VIDEO.tsv`、194行）と割り当て表（`20230309_G4.0_RunNow_ビデオ割り当て.xlsx`）から一度だけ作った定義です。取り込みの後は、教材名・並び順の変更等は admin で行います（このファイルを直して再実行しても、取り込み済みの行は書き換えません）。

- Foundational 1〜4 / Personalized 1〜4: 割り当て表の CATEGORY を教材、SUB-CATEGORY を区切りにしています。
  - 旧マスタにあって割り当て表に無い P-1-1-6 は、番号どおり 1.1 の P-1-1-5 の後に置いています。
  - 割り当て表にあってファイルの無い P-3-2-1・P-3-2-2 は除いています（P-3 の区切り「3.2」は作りません）。
- S-1〜S-4: 見出しの無い区切り1つ。番号の順（旧マスタの SORTNO の順ではありません）。
- on-demand: Logical Dialogue（区切り Unit 1〜4）・時制・発音 R・L。cvc: ColorVowel 入門。
- タイトルは旧マスタの値（`&quot;` は `"` に戻しています）です。同じタイトルの動画（F-2-1-2〜4、S-2-8 と S-2-21）は旧データのままです。

突き合わせのキーは、教材 = `content_label`（`VIDEO_F1` 等）、区切り = 教材と見出し、ビデオ = `legacy_code`（旧ファイル名）です。途中で止まっても、再実行すれば続きから取り込みます。

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

## 置き場所（R2 の準備まで）

ファイルはアプリ（`packages/lib/video/storage.ts`）と同じバケットに置きます。R2 の準備ができるまでは dev の Supabase Storage の一時のバケット `video` だけに置けるため、staging・本番の `--apply` は中止します（`--prepare` は実行できます）。R2 に移す時は、`storage.ts` と一緒に `run.mjs` の `createVideoStorage` を直し、dev は取り込んだ教材を消してから取り込み直します（`legacy_code` が残っていると取り込み済みとして飛ばすため）。
