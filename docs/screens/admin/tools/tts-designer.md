# TTS Designer（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/tools/tts-designer`
- 対象ロール: `admin`, `content_manager`（サイドバーの「Tools」グループ配下）
- 目的: CV Dictionaryや特定フレーズに紐づかない、汎用的なAI音声アセット（任意の英文＋読み上げ
  設定）を作成・管理する。

## この画面に来る経路

- サイドバーメニューの「Tools」グループ内「TTS Designer」から遷移する。

## 画面の構成

1. **ヘッダー** — 画面タイトルと説明文
2. **音声作成エリア（Design New Audio）** — 英文入力、メモ入力、単語単位の調整、
   Voice/Style/話速/ピッチ設定、SSMLエディタ、試聴・保存操作
3. **作成済みアセット一覧（Recent Assets）** — テーブル形式。検索・ページング・再生・
   ダウンロード・削除

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 英文入力欄 | 常時表示 | 入力すると単語ごとの調整用チップが自動生成され、AUTOモードのSSMLも自動更新される |
| メモ欄 | 常時表示（任意項目、管理用） | 保存時にアセットのコメントとして記録される |
| 単語チップ | 英文入力後、AUTOモード時のみ操作可 | クリックすると強調・後続ポーズ・IPA発音表記を設定するポップオーバーが開く |
| Voice／Style選択 | AUTOモード時のみ操作可 | 選択に応じてSSMLが自動再構築される。Voiceには国・性別バッジと推奨（Rec）／人気（Pop）マークが付く |
| 話速／ピッチスライダー | AUTOモード時のみ操作可 | 値に応じてSSMLが自動再構築される |
| AUTO/MANUALトグル | 常時表示 | MANUALに切り替えるとSSMLを直接編集できる。AUTOに戻す際は手動編集内容が上書きされる旨の確認ダイアログが出る |
| 「COPY SSML」ボタン | 常時表示 | 現在のSSMLをクリップボードにコピーする |
| 「RESET ALL」ボタン | 常時表示 | 入力・設定をすべて初期状態に戻す |
| 「LISTEN RESULT」ボタン | SSMLが存在する場合のみ有効 | 現在のSSMLで試聴する |
| 「SAVE ASSET」ボタン | 英文が入力されている場合のみ有効 | フレーズ・コメント・SSML・調整内容をアセットとして保存し、音声ファイルをStorage
  （`audio/designer/`配下）に生成する。保存成功後は入力内容がリセットされる |
| 一覧の検索ボックス | 常時表示 | フレーズまたはコメントに含まれる文字列で絞り込む |
| 一覧の「Listen」ボタン | 音声生成済みの行に表示 | 音声を再生する |
| 一覧のダウンロードアイコン | 音声生成済みの行に表示 | 音声ファイルをダウンロードする |
| 一覧の削除アイコン | 各行に表示 | 確認ダイアログの上で、アセットのレコードとStorage上の音声ファイルを削除する |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 単語調整エリア空 | 「Input text above to start tuning...」 | 英文が未入力の場合 |
| 一覧0件 | 「No matching assets found.」 | 検索条件に一致するアセットが無い、またはアセットが未登録の場合 |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/tools/tts-designer/page.tsx`
- `apps/admin/app/(app)/tools/tts-designer/_components/TTSAssetGenerator.tsx`
- `apps/admin/app/(app)/tools/tts-designer/_components/TTSAssetTable.tsx`
- `apps/admin/actions/adminTTSAction.ts`（`saveTTSAssetAction`, `deleteTTSAssetAction`。RPCは
  使わず`com_t_tts_asset`テーブルとStorage `audio`バケットを直接操作する）
- `packages/lib/azure/ssml.ts`（`buildSSML`）, `packages/lib/hooks/usePlayAzureSpeech`,
  `packages/lib/hooks/usePlayAudioSpeech`
