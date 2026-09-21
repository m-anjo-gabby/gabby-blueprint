# 教材詳細エディタ（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/contents/[id]`（スプリント教材の場合は`?type=<問題種別>`が付与される）
- 対象ロール: システム管理者
- 目的: 個別の教材の中身（単語帳教材の単語・フレーズ・音声、スプリント教材の問題・音声、または
  ダイアログ教材のセッション明細）を編集する。教材の基本情報（名称・公開範囲・セット分類等）は
  この画面では扱わず、一覧画面（`/contents`）の編集ダイアログで行う。
- 教材種別が「ビデオ」の場合、専用エディタは未実装で「このコンテンツタイプのエディタは準備中です」
  という案内のみが表示される。

## この画面に来る経路

- 教材管理一覧（`/contents`）の各行の詳細（矢印）ボタン、または新規登録直後の遷移で来る。

## 画面の構成

1. **共通ヘッダー** — 一覧へ戻るボタン、教材名・ID・種別、（単語帳教材のみ）一括登録・一括音声生成ボタン
2. **単語帳教材（種別=単語帳）の場合**: 左右2ペイン構成
   - 左ペイン: 単語一覧（検索・新規追加・編集・削除）
   - 右ペイン: 選択した単語に紐づくフレーズ（例文）一覧。単語を選択するまでは案内表示のみ
3. **スプリント教材（種別=スプリント）の場合**: 上部フィルタツールバー＋問題一覧
   - ツールバー: 問題種別・レベルの絞り込み、一括音声作成、CSV(TSV)一括登録、新規追加
   - 問題一覧: 選択中の種別・レベルに該当する問題をカード形式で表示
4. **ダイアログ教材（種別=ダイアログ）の場合**: 上部ツールバー＋セッション一覧
   - ツールバー: セッション件数バッジ、「セッション追加」ボタン
   - セッション一覧: セット配下の各セッション（セッション番号順）を、コーチ用/生徒用スライド
     リンクと管理メモを添えてカード形式で表示

## 単語帳教材の編集

### 単語一覧（左ペイン）

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 検索ボックス | 常時表示 | 英語表記・日本語表記の部分一致でリストを絞り込む（画面内フィルタ） |
| 単語カード | 頻度ランク、英語表記、日本語表記、ステータスバッジ（公開/非公開等） | クリックすると選択状態になり、右ペインにフレーズ一覧を表示する。URLの`wordId`クエリに反映される |
| 「単語追加」ボタン | 常時表示 | 単語登録ダイアログを開く（英語表記・日本語表記が必須、ランク・ステータスを指定） |
| 編集アイコン（カードホバー時） | 各単語カード | 単語登録ダイアログが編集モードで開く |
| 削除アイコン（カードホバー時） | 各単語カード | 確認ダイアログを経て削除する。紐づく例文（フレーズ）もすべて削除される旨が明記される |

### フレーズ一覧（右ペイン）

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| フレーズカード | 表示順、種別、英文、和訳、TTS（音声生成）ステータスバッジ（生成済/要更新/エラー/未生成） | 表示のみ |
| 再生ボタン（Listen） | 音声が生成済みのフレーズ | その場で音声を再生する |
| ダウンロードボタン | 音声が生成済みのフレーズ | MP3ファイルとしてダウンロードする |
| 「フレーズ追加」ボタン | 常時表示 | フレーズ登録ダイアログを開く（英文・和訳が必須、種別・表示順・公開設定を指定） |
| 編集アイコン | 各フレーズカード | フレーズ登録ダイアログが編集モードで開く |
| 削除アイコン | 各フレーズカード | 確認ダイアログを経て削除する（音声ファイルもあわせて削除される） |
| TTS設定アイコン（歯車） | 各フレーズカード | 「Azure TTS Voice Designer」ダイアログを開く |

### Azure TTS Voice Designer（フレーズ単位の音声生成ダイアログ）

- 単語ごとに強調（Emphasis）・強調の強さ・後続のポーズ・IPA発音記号を個別調整できる
  （原文の単語をクリックして設定パネルを開く）。
- ボイス・スタイル・速度（Speed）・ピッチ（Pitch）を設定でき、設定を変更すると自動的にSSML
  （音声合成用のマークアップ）が再生成される（AUTOモード）。
- SSMLコードを直接手書きで編集する「MANUAL」モードに切り替えることもできる。MANUALから
  AUTOへ戻す際は、手動編集の内容が破棄される旨の確認ダイアログが出る。
- 「ORIGINAL」ボタンで無調整の原文再生、「LISTEN」ボタンで現在の設定での再生プレビューができる。
- 「SAVE」ボタンで確認ダイアログの上、Azure Speech Serviceで音声を生成し、Supabase Storageへの
  保存とDB更新を行う。SSMLの構文エラーがある場合はその場にエラーメッセージが表示される。

### 一括登録・一括音声生成（ヘッダーのボタン。単語帳教材のみ）

- **一括登録**: CSVファイル（`word_en`, `word_ja`, `rank`, `phrase_en`, `phrase_ja`, `phrase_type`
  の列が必須）をドラッグ&ドロップまたは選択してアップロードすると、単語ごとにグルーピングして
  内容をプレビューする。行の不備（必須項目の欠落、ランクが数値でない等）はエラー一覧として表示され、
  エラーが1件でもあるとインポートを実行できない。インポートを実行すると、既存の同名単語・フレーズは
  上書き（Upsert）される。サンプルCSVのダウンロードリンクがある。
- **一括音声生成**: 対象範囲を「すべて再生成」「未生成のみ」から選び、ボイス・スタイル・速度・
  ピッチを設定してテストプレビューできる。実行前に対象件数と「既存の音声は上書きされる」旨の
  最終確認が入る。実行中は進捗（件数）が表示され、完了後は成功/エラー件数を通知する
  （処理中はダイアログを閉じられない）。

## スプリント教材の編集

### フィルタツールバー

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 問題種別セレクト | 教材のスプリント種別・対応設定（登録時に設定した「有効にする問題種別」）に応じて選択肢が絞られる（UG Speed / UG Builders / UG Structure / UG Mastery） | 選択した種別の問題一覧を再取得する |
| レベルセレクト | 教材側で「問題種別ごとのレベル管理」が無効な場合は選択不可（固定） | 選択したレベルの問題一覧を再取得する |
| 「一括音声作成」ボタン | 常時表示 | 選択中の種別・レベルの問題を対象に一括音声生成ダイアログを開く |
| 「一括登録」ボタン | 常時表示 | TSV（タブ区切り）一括登録ダイアログを開く。必須列に`tsv_group_id`（Speed以外でグループ識別用）を含む |
| 「新規追加」ボタン | 常時表示 | 問題登録ダイアログを開く |

### 問題一覧

- Speed種別は1問1カードで表示される。Speed以外（Builders/Structure/Mastery）は複数の設問が
  グループ（`group_id`）単位でまとめられ、1枚のカードの中に複数の設問が並ぶ
  （グループ単位で「指示/Cue」や共有の前提文（Statement）を持つ）。
- 各設問には「指示/Cue」（Builders・Structureのみ）、Question、Answer(Yes)、（Speedのみ）
  Answer(No)の区分があり、各区分ごとに個別に音声を生成・確認できる（生成済/未生成バッジ、
  再生ボタン、TTS設定ダイアログ）。
- 編集・削除は各設問単位。削除は確認ダイアログを経て取り消せない操作として実行される。
- 問題登録ダイアログでは、グループ内に複数の設問をまとめて追加・編集できる
  （Question・Answer(Yes)は必須、その他は種別により任意）。

## ダイアログ教材の編集

### セッション一覧

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| セッション件数バッジ | 常時表示 | 表示のみ |
| セッションカード | セッション番号、コーチ用スライド（タイトル・リンク）、生徒用スライド（タイトル・リンク）、管理メモ（設定時のみ） | スライドリンクは新規タブで開く外部リンク |
| 編集アイコン | 各セッションカード | セッション登録ダイアログが編集モードで開く |
| 削除アイコン | 各セッションカード | 確認ダイアログを経て論理削除する（取り消せない操作として案内） |
| 「セッション追加」ボタン | 常時表示 | セッション登録ダイアログを開く（セッション番号は既存最大値+1が初期値） |

### セッション登録ダイアログ

- 入力項目: セッション番号（必須、数値）、コーチ用スライド（表示タイトル・URL、いずれも任意）、
  生徒用スライド（表示タイトル・URL、いずれも任意）、教材制作・運用メモ（管理者向け、任意）。
- 同一教材内でセッション番号が重複する場合は保存時にエラーメッセージを表示する
  （DB側のUNIQUE制約`(content_id, session_no)`による）。
- コーチ用スライド・生徒用スライドのリンクは、コーチアプリの生徒別ダイアログプラクティス画面
  （`apps/coach`の`/students/[id]/dialogue-practice`）で生徒に表示される。

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 教材が存在しない | 404（Not Found） | 指定したcontent_idが存在しない場合 |
| 単語未選択 | 右ペインに「単語を選択するとフレーズを管理できます」の案内（ja/en切替対応） | 単語帳教材で、URLに`wordId`が無い場合 |
| 一覧読み込み中 | スピナー表示 | 単語・フレーズ・問題・セッションの取得中 |
| 単語帳一覧が空 | 「フレーズが登録されていません」等の空状態表示 | 対象データが0件の場合 |
| セッション一覧が空 | 「セッションが登録されていません」の空状態表示 | ダイアログ教材でセッションが0件の場合 |
| セッション番号の重複 | 保存時にエラーメッセージを表示（ダイアログは閉じない） | 同一教材内で既存のセッション番号と重複した場合 |
| 一括登録・一括音声生成でエラー発生 | エラー一覧、または成功/エラー件数を通知するダイアログ | CSV/TSVの内容不備、または音声生成の一部失敗 |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/contents/[id]/page.tsx`
- `apps/admin/app/(app)/contents/[id]/_components/EditorHeader.tsx`
- `apps/admin/app/(app)/contents/[id]/_components/editors/WordEditor/`
  （`index.tsx`, `WordList.tsx`, `WordFormDialog.tsx`, `PhraseList.tsx`, `PhraseFormDialog.tsx`,
  `TTSDialog.tsx`, `TTSBulkDialog.tsx`, `WordBulkImportDialog.tsx`）
- `apps/admin/app/(app)/contents/[id]/_components/editors/SprintEditor/`
  （`index.tsx`, `SprintQuestionList.tsx`, `SprintQuestionFormDialog.tsx`, `SprintTTSDialog.tsx`,
  `SprintTTSBulkDialog.tsx`, `SprintBulkImportDialog.tsx`）
- `apps/admin/app/(app)/contents/[id]/_components/editors/DialogueEditor/`
  （`index.tsx`, `DialogueSessionList.tsx`, `DialogueSessionFormDialog.tsx`）
- `apps/admin/actions/adminDialogueAction.ts`
  （`getDialogueSessions`, `upsertDialogueSession`, `deleteDialogueSession`。RPCではなく
  `com_m_dialogue_session`への直接CRUD。論理削除）
- `apps/admin/actions/adminContentAction.ts`（`getContentById`）
- `apps/admin/actions/adminWordAction.ts`（`getWordsByContentId`, `upsertWord`, `deleteWord`,
  `getPhrasesByWordId`, `upsertPhrase`, `deletePhrase`, `bulkUpsertWordsAndPhrases`）
- `apps/admin/actions/adminPhraseAction.ts`（`getPhrasesByContentId`）
- `apps/admin/actions/adminSprintAction.ts`（`getSprintQuestionsByFilter`, `bulkUpsertSprintQuestions`,
  `deleteSprintQuestion`, `saveSprintAudio`）
- `apps/admin/hooks/useSaveAzureSpeech.ts`（Azure TTS生成〜Storage保存〜DB更新の一連処理）
- `packages/lib/azure/ssml.ts`（SSML生成ロジック）
- `packages/types/word.ts`, `packages/types/sprint.ts`（`WORD_STATUS`, `PHRASE_TYPES`,
  `QUESTION_TYPES`, `SPRINT_TYPES`の正本）
- `packages/types/dialogue.ts`（`DialogueSession`（`com_m_dialogue_session`のDBレコード型）の正本。
  コーチアプリのダイアログプラクティス機能と共有）
