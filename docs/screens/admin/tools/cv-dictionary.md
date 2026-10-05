# CV Dictionary（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/tools/cv-dictionary`
- 対象ロール: `admin`, `content_manager`（サイドバーの「Tools」グループ配下）
- 目的: ColorVowel辞書（英単語ごとの品詞別エントリ：日本語訳・音節・発音記号・音声）の登録・編集・
  削除、および音声（TTS）の個別／一括生成を行う。

## この画面に来る経路

- サイドバーメニューの「Tools」グループ内「CV Dictionary」から遷移する。

## 画面の構成

左右2ペインのリサイズ可能なレイアウト。

1. **左ペイン：単語一覧** — 検索ボックス、「一括登録」「単語追加」ボタン、単語リスト
   （品詞数・音声生成済み件数バッジ、ホバー時に削除アイコン）
2. **右ペイン：品詞別エントリ一覧** — 左ペインで単語を選択すると、その単語の品詞ごとの
   エントリカードが表示される（未選択時は「単語を選択してください」というプレースホルダー）
3. **単語・エントリ登録／編集ダイアログ**
4. **一括登録（CSV/TSV）ダイアログ**
5. **音声（TTS）作成ダイアログ**（エントリ単位）
6. **一括音声生成ダイアログ**（辞書全体）

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 左ペイン検索ボックス | 常時表示 | 入力した文字列で英単語を前方一致ではなく部分一致絞り込みする（画面内フィルタ、再取得はしない） |
| 単語リストの各行 | 常時表示。品詞数バッジ、音声生成済み件数バッジ（生成率が100%なら緑、未完了なら黄色） | クリックすると右ペインにその単語の品詞別エントリが表示される（URLの`word`パラメータに反映） |
| 単語行の削除アイコン | 行ホバー時に表示 | 確認ダイアログの上で、その単語の全品詞エントリと音声ファイルをまとめて削除する |
| 「単語追加」ボタン | 常時表示 | 新規エントリ登録ダイアログを開く（品詞を含めて新規入力） |
| 「一括登録」ボタン | 常時表示 | CSV/TSV一括登録ダイアログを開く |
| エントリカードの編集アイコン | 各エントリに表示 | 編集ダイアログを開く（英単語・品詞は変更不可、それ以外の項目のみ編集可） |
| エントリカードの「音声作成」アイコン | 各エントリに表示 | 音声（TTS）作成ダイアログを開く |
| エントリカードの削除アイコン | 各エントリに表示 | 確認ダイアログの上で、そのエントリと音声ファイルを削除する |
| 「Listen」ボタン | エントリに音声ファイルがある場合のみ表示 | 生成済み音声を再生する |
| エントリカードの詳細情報 | 音節・発音記号・原形（登録されている場合のみ）・ストレス母音・CV Color | — |
| TTSステータスバッジ | 常時表示（生成済／要更新／エラー／未生成） | — |
| 「一括音声」ボタン | 右ペインのヘッダーに常時表示 | 一括音声生成ダイアログを開く（選択中の単語ではなく辞書全体が対象） |

## 単語・エントリ登録／編集ダイアログ

- 入力項目: 英単語、品詞、日本語訳、音節（syllables）、主強勢音節番号、ストレス母音スペリング、
  CV Color ID、発音記号、原形（Lemma。語形変化した見出し語のみ入力し、原形そのものの語は空欄）
- 英単語・日本語訳は必須。その他は任意項目
- 「内容を確認する」で入力内容の確認表示に切り替わり、「確定する」で保存する
- 既存単語に品詞を追加する場合（右ペインの「単語追加」相当）は英単語欄が固定表示になる
- 編集モードでは英単語・品詞は変更できない（別エントリとして扱われるため）

## 一括登録（CSV/TSV）ダイアログ

- CSVまたはTSVファイルをドラッグ&ドロップ、またはクリックして選択する
- 必須列: `word_en`, `part_of_speech`, `word_ja`, `syllables`, `primary_stress_syllable`,
  `stress_vowel_spelling`, `cv_id`（DBのNOT NULL制約に合わせている）。任意列: `phonetic_spelling`,
  `lemma`（原形。見出し語と同じ値や空欄は「原形なし」として扱う）。
  それ以外の列（例: 作成時の確認メモ）は無視される
- 必須列が欠けている場合はファイル構造エラーとして読み込みを拒否する
- 読み込み後、既存の辞書データと照合する（照合キーは英単語[大文字小文字を区別しない]＋品詞）。
  照合中は「既存の辞書データと照合しています...」を表示する
- 行ごとに次を検証し、エラー行がある場合はエラー内容の一覧のみを表示する
  （1件でもエラーがあるとインポートは実行できない）
  - 必須項目の空チェック
  - `part_of_speech` が品詞キー（NOUN / VERB / ADJ / ADV / PRON / PREP / CONJ / ART / INT / UNKNOWN）のいずれか
  - `primary_stress_syllable` が1以上の整数で、`syllables` の音節数以内
  - `stress_vowel_spelling` がアクセント音節に含まれる
  - `cv_id` がColor Vowelの定義値のいずれか
  - `lemma` が英数字・アポストロフィ・ハイフンのみで構成されている
  - ファイル内で同じキーの行が内容違いで複数ある（同一内容の重複はエラーにせず、後の行を除外する）
- サマリーカードに Total / New（新規）/ Existing（登録済み）/ Errors（エラー時）または
  Duplicates（ファイル内の同一内容の重複）を表示する
- エラーが無い場合は「Ready for Import!」の確認画面で取込モードを選び、「N件をインポート」で確定する
  - **新規のみ登録**（既定）: 登録済みのキーはスキップし、既存データは変更しない
  - **既存も上書き**: 登録済みのキーも上書きする。登録日時は保持し、音声生成済み
    （`tts_status=1`）のエントリは「要更新」（`tts_status=2`）にする。大文字小文字だけが異なる
    既存行は、既存の表記のまま更新する。ファイルに `lemma` 列が無い場合、既存の原形は変更しない
- 完了時は新規・更新・スキップ件数をトーストで表示する
- サンプルファイルのダウンロードリンクあり（`/templates/cv_dictionary_sample.tsv`）
- 取込用TSVは、スプリント一括登録TSVからClaude Codeのプロジェクトスキル `/cv-dictionary-tsv`
  （`.claude/skills/cv-dictionary-tsv/`）で作成できる

## 音声（TTS）作成ダイアログ（エントリ単位）

- 対象単語の読み上げテキストを単語単位に分解し、各単語をクリックすると強調（Emphasis）・
  後続ポーズ（Pause）・IPA発音表記を個別に設定できるポップオーバーが開く
- 音声設定（Voice／Style／話速／ピッチ）を変更すると、AUTOモードでは設定内容から自動的に
  SSML（読み上げ制御用のマークアップ）が再生成される
- MANUALモードに切り替えるとSSMLを直接編集できる（この場合、単語ごとの調整UIとVoice設定は
  操作不可になる）。MANUAL→AUTOへ戻す際は手動編集内容が破棄される旨の確認ダイアログが出る
- 「ORIGINAL」でデフォルト設定の読み上げ、「LISTEN」で現在のSSMLでの読み上げを試聴できる
- 「SAVE」を押すと保存確認ダイアログが出る。確定すると音声が生成されStorage（`audio`バケット）
  に保存され、既存の音声ファイルは削除される

## 一括音声生成ダイアログ

- 対象範囲を「Re-generate All（全件再生成）」「Missing Only（未生成のみ）」から選択する
- Voice／Style／話速／ピッチを設定し、「TEST PREVIEW」でサンプル文を試聴できる
- 「NEXT STEP」→最終確認（対象件数と「既存の音声は上書きされます」の警告）→「CONFIRM & START」で
  1件ずつ順次音声生成を実行する（進捗バーで現在件数／全体件数を表示）
- 全件成功した場合は自動的にダイアログが閉じる。1件でも失敗した場合は成功／エラー件数を示す
  結果ダイアログが表示される

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 右ペイン未選択 | 「単語を選択してください」 | URLに`word`パラメータが無い場合 |
| エントリ読み込み中 | スピナー「Loading entries...」 | 単語選択直後、エントリ取得中 |
| エントリ0件 | 「エントリが登録されていません」 | 選択した単語に品詞エントリが1件も無い場合 |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/tools/cv-dictionary/page.tsx`
- `apps/admin/app/(app)/tools/cv-dictionary/_components/CVWordList.tsx`
- `apps/admin/app/(app)/tools/cv-dictionary/_components/CVEntryList.tsx`
- `apps/admin/app/(app)/tools/cv-dictionary/_components/CVWordFormDialog.tsx`
- `apps/admin/app/(app)/tools/cv-dictionary/_components/CVWordBulkImportDialog.tsx`
- `apps/admin/app/(app)/tools/cv-dictionary/_components/CVTTSDialog.tsx`
- `apps/admin/app/(app)/tools/cv-dictionary/_components/CVTTSBulkDialog.tsx`
- `apps/admin/lib/cvDictionaryImport.ts`（一括登録の行検証・キー正規化。クライアントの
  プレビュー、Server Action、`/cv-dictionary-tsv` スキルの検証スクリプトで共通使用）
- `apps/admin/actions/adminCVDictionaryAction.ts`（`getCVDictionaryWords`,
  `getCVDictionaryByWord`, `upsertCVDictionaryEntry`, `deleteCVDictionaryEntry`,
  `getCVDictionaryKeys`, `bulkUpsertCVDictionary`, `saveCVDictionaryAudio`,
  `getAllCVDictionaryEntries`。RPCは使わず
  `com_m_color_vowel_dictionary`テーブルとStorage `audio`バケットを直接操作する）
- `packages/lib/azure/ssml.ts`（`buildSSML`）, `packages/lib/hooks/usePlayAzureSpeech`
