# Live Sprint 実施画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/students/[id]/lesson-sprint`（クエリ: `?session_id=...` — セッションハブ経由で開いた
  場合のみ付与される）
- 対象ロール: コーチ
- 目的: コーチが生徒とのライブセッション中（または単独）に、スコア付きの発話トレーニング
  「Live Sprint」を設定・実施する。画面はヘッダー/サイドバーを覆う没入表示（フルスクリーン
  カード）になる。

## この画面に来る経路

- セッションハブ（`/students/[id]/sessions/[sessionId]`）の「Training」セクション、
  「Live Sprint」カードの「Start」ボタンから（`?session_id=`付き）
- 生徒概要画面（`/students/[id]`）のヘッダー、次回セッションが無い場合の「Start Live Sprint」
  ボタンから（`session_id`無し＝単独実施）
- Live Sprint結果画面の「Start Another Live Sprint」「Repeat Same Settings」から

## 画面の構成

この画面は「設定（Setup）」と「実施（Player）」の2ビューを1つの没入カード内で切り替える
単一ページ構成。

1. **Setup画面** — コンテンツ・種別・レベル・制限時間を選び、開始する
2. **Player画面** — 制限時間内に問題へ回答し、コーチが1〜5点で評価する
3. **右側パネル** — Setup中は「Student Snapshot」（生徒のSprint Progress要約と直近3件の実施
   履歴）、Player中は「Notes」（実施中に自由記述できるメモ欄。結果画面のSession Notesとして
   保存される）

## Setup画面：表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 戻るボタン（左上） | 常時 | `session_id`があればセッションハブへ、無ければ生徒概要へ戻る |
| Contentセレクト | この生徒のテナントで公開されている教材（共通公開＋生徒のテナントにアクセス権がある限定公開）から選択。他の担当生徒・コーチ自身のテナント向けの教材は出ない | 選択した教材に応じて、対応していない種別（Question Type）はボタンが無効化（「Unavailable」）される。教材切替時、選択中の種別が非対応なら最初にサポートされる種別＋レベルへ自動的にリセットされる |
| Question Type（Speed/Structure/Builders/Mastery） | コーンテンツに応じて選択可否が変わる | 選択すると推奨制限時間（Recommended）も連動して変わる |
| Levelボタン群 | 種別にレベル設定がある教材のみ表示。無い教材は「This content has no level setting」 | 選択したレベルで開始する |
| Time Limitボタン群 | 選択肢から選ぶ。種別の推奨値には「Recommended」表示 | 選択した秒数がPlayer画面のタイマーに反映される |
| 「i」（Info）ボタン（ヘッダー右） | 開始前かつコーパス教材でない場合のみ | レベル詳細ダイアログ（Sprint Theme）を開く |
| 開始ボタン | Speed種別選択時は「Start (YES)」「Start (NO)」の2択、それ以外は「Start Live Sprint」1つ | 問題を取得できたらPlayer画面へ遷移する。取得できなければエラートースト |

## Player画面：表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| タイマーバー・残り秒数 | 常時。残り50%以下で黄色、20%以下で赤色に変化 | 一時停止ボタンで停止/再開できる（一時停止中はカウントダウンが進まない） |
| 開始前インストラクション画面 | Player画面に入った直後、まだ「Start」を押していない状態 | 種別ごとの注意文を確認して「Start」を押すとタイマーが動き出す |
| Statement（該当する種別のみ）・Question・Answer | 各問題ごとに表示 | Answer欄は単語ごとにタップでき、タップした単語が赤くハイライトされる（発音・脱落フィードバック記録用） |
| 評価ボタン（1〜5点） | 常時 | クリックした点数でその設問を確定し、次の設問へ進む。最後の設問を評価すると自動的に結果を保存する |
| 制限時間切れ | タイマーが0になった時点 | 未評価の現在の設問はデフォルト点で自動確定され、その時点までの結果が保存される |
| Notesパネル（右側、実施中も常時表示） | 常時 | 自由記述したメモは結果画面のSession Notesとして保存される |
| 終了確認 | 戻るボタンをクリック | 「Quit Live Sprint?」の確認ダイアログ。進行中の内容は保存されない |

## 完了時の挙動

全設問の評価完了、または制限時間切れで結果が保存されると、保存中スピナー→「Live Sprint
Complete」の完了サマリー（回答数・平均スコア）がオーバーレイ表示される。3.5秒後に自動的に、
または「View Results」ボタンで即座に、Live Sprint結果画面（`/students/[id]/lesson-sprint/result/[sprintId]`）
へ遷移する。

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 利用可能な教材が無い | 「No sprint content available」 | この生徒のテナントで公開されているスプリント教材が1件も無い場合 |
| 「Repeat Same Settings」経由 | Setup画面を経由せず直接Player画面が開く | Live Sprint結果画面から同一設定で再実施した場合 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/[id]/lesson-sprint/page.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/_components/LessonSprintApp.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/_components/LessonSprintSetup.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/_components/LessonSprintPlayer.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/_components/ScoreButtons.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/_components/WordHighlightAnswer.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/_components/SprintThemeDialog.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/_components/StudentSnapshotPanel.tsx`
- `apps/coach/app/(app)/students/[id]/lesson-sprint/_hooks/useLessonSprintTimers.ts`
- サーバーアクション: `getAvailableSprintContents`, `getLessonSprintQuestions`,
  `createLessonSprintResult`（`apps/coach/actions/lessonSprintAction.ts`）
- 教材候補は`com_m_contents`のRLSに委ねず、RPC`get_student_available_content_ids`で対象生徒単位に
  絞り込む（RLSはコーチが担当した全生徒のテナントの限定公開教材を可視とするため。2026-09-24修正）。
  結果登録（`createLessonSprintResultCore`）でも同じ範囲をサーバー側で再検証し、範囲外は`forbidden`。
