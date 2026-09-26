# 生徒概要（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/students/[id]`
- 対象ロール: コーチ（自分が現在または過去に担当した生徒のみ閲覧可能。担当関係が無い生徒IDを
  指定した場合は404になる）
- 目的: 1人の生徒についての情報（契約・ライブセッション履歴・Live Sprint成績・コーチノート・
  トレーニングレポート）を1画面に集約し、各機能の詳細画面への入口を提供するハブ画面。

この画面配下（`/students/[id]/...`）には共通のタブナビゲーションを持つレイアウトファイルは
存在しない。各サブ画面はそれぞれ独立したページで、「← Back to Overview」等のリンクで
この概要画面へ戻る導線を個別に持つ構成になっている（詳細は各サブ画面の仕様書を参照）。

## この画面に来る経路

- 担当生徒一覧（`/students`）の生徒カードをクリックして遷移する
- 各サブ画面（コーチノート・トレーニングレポート・Live Sprint履歴等）の「Back to Overview」
  リンクから戻る
- セッションハブ（`/students/[id]/sessions/[sessionId]`）の「Back to Overview」から戻る

## 画面の構成

1. **ヘッダーカード（`StudentOverviewHeader`）** — 生徒アバター・氏名・タイムゾーン、現在の契約
   情報、Sprint Progress（レーダーチャート）、直近1週間の状況を確認する「Next Live Session」帯
2. **Live Sessions カード** — この生徒とのライブセッション一覧（契約ごとにタブ切替）
3. **Live Sprint カード** — 直近のLive Sprint実施履歴（最大10件）
4. **Dialogue Practice カード** — 割り当て済みのダイアログプラクティス教材とセッション進捗の要約
5. **Coach Notes カード** — 自分専用のメモ（直近5件）の閲覧・新規追加
6. **Training Reports カード** — 契約ごとの月次的なコメント（直近5契約分）の閲覧・下書き保存・確定

カードは2列グリッドで並び、いずれも「View all」等のリンクから専用の一覧画面（コーチノート
一覧・トレーニングレポート一覧・Live Sprint履歴）へ遷移できる。

## ヘッダー（`StudentOverviewHeader`）の詳細

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 「← Back to Students」リンク | 常時 | 担当生徒一覧（`/students`）へ戻る |
| 生徒アバター・氏名・タイムゾーン | 常時 | 操作なし |
| Current Contractカード | 現在有効な契約がある場合、プラン名・期間を緑系で表示 | 操作なし |
| 契約セッション内訳（Total/Scheduled/Completed/Unbooked） | 現在有効な契約がある場合のみ表示。値は**自分が担当している分のみ**の集計（他コーチ担当分は合算しない） | 操作なし。Unbookedが1件以上あると数字が橙色で強調される |
| 「+ n session(s) handled by another coach」 | 週2回契約等で他コーチと分担しており、他コーチ担当セッションがある場合 | 操作なし（参考情報） |
| Sprint Progressパネル（レーダーチャート） | 常時。Stage番号と、Speed/Structure/Builders/Masteryそれぞれの現在レベルを表示 | 「Manage Levels」ボタンでレベル管理ダイアログを開く |
| Next Live Sessionパネル | 実施可能な次回セッションがあれば日時＋「Open Session」ボタン、無ければ「Start Live Sprint」ボタン | 「Open Session」はセッションハブ（`/students/[id]/sessions/[sessionId]`）へ、「Start Live Sprint」はLive Sprint画面（単独実施）へ遷移 |

### レベル管理ダイアログ（Manage Levels）

「By Question Type」と「Stage」の2タブで構成される。

- **By Question Typeタブ**: 種別（Speed/Structure/Builders/Mastery）ごとに、現在レベルより上の
  レベルを選んで「Level Up」ボタンで即時反映する（最大レベルに達している種別は「Max level
  reached」と表示され操作不可）
- **Stageタブ**: 現在のStageより上のStageを選び、「Advance to Stage n」（要件を全て満たしている
  場合）または「Force Advance to Stage n」（満たしていない項目がある場合、それらのレベルを
  必要最小値まで自動的に引き上げて強制的にStageを進める）ボタンで進行させる。要件未達の項目は
  「現在値 → 必要値」の一覧が表示される

## Live Sessions カード

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 「Show sessions from other coach」トグル | 表示中の契約に他コーチ担当のセッションが含まれる場合のみ表示 | ONにすると、他コーチ担当分のうち実施予定・実施結果があるセッションも一覧に含める（キャンセル・振替等は常に除外） |
| 契約選択セレクト | 契約が2件以上ある場合のみ表示 | 選択した契約のセッション一覧に切り替える |
| Scheduled / Completed / Changes タブ | Scheduledタブは実施予定セッションが1件以上ある場合のみ表示 | 各タブで該当セッションを一覧表示。Scheduledは開始日時の昇順（対応すべきものが先頭に来る）、他は降順 |
| セッション行 | 日時・ステータスバッジを表示。担当外セッションにはコーチ名バッジが付く | 実施予定・実施結果があるセッション（自分担当分）はクリックで遷移（実施予定→セッションハブ、それ以外→セッション結果画面）。キャンセル・振替済みの行はクリック不可 |
| 「Cancel」ボタン | 自分担当・実施予定（scheduled）かつ開始前のセッション行にのみ表示 | セッションキャンセルダイアログを開く（下記参照） |
| 「Needs your action — tap to open the Hub.」 | 自分担当のscheduledセッションで、終了予定時刻を過ぎてもEnd Session/Resolveされていない場合 | 行をクリックするとセッションハブへ遷移し、そこで対応する |
| 「Not all contracted sessions could be scheduled」注記 | この契約の枠に、コマ数に対して未消化枠がある場合 | 予約はコーチ側からは行えず、参考表示のみ（生徒がカレンダーからリクエストする） |

### セッションキャンセルダイアログ

- コーチがキャンセルする場合、生徒のチケットは常に返還される旨の注記が出る
- 入力項目: キャンセル理由（任意）、代替候補（振替候補）の提案欄（任意、最大3件。各候補は
  開始24時間以上先である必要があり、それより手前だと注意メッセージが出る。コーチ・生徒いずれかの
  既存予定と重複する場合はその場でエラー表示される）
- 送信するとセッションはキャンセルされ、候補を指定していれば生徒へ振替候補として通知が届く
- この画面固有の要素の詳細な承認フロー（生徒側の承諾・却下等）は下記の関連業務フロー仕様書を参照

## Live Sprint カード

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 「View history」リンク | 常時 | Live Sprint履歴一覧（`/students/[id]/lesson-sprint/history`）へ遷移 |
| 履歴行（最大10件） | 教材名、種別・レベル・実施日時、平均スコア | クリックでLive Sprint結果画面へ遷移（戻り先はこの概要画面） |

## Dialogue Practice カード

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 「+ Assign」ボタン | 常時 | 教材選択ダイアログをその場で開く（下記参照。このカードから遷移せずに割当が完結する） |
| 「Manage」リンク | 常時 | Dialogue Practice管理画面（`/students/[id]/dialogue-practice`）へ遷移 |
| 割当セット行 | **未完了のセットのみ**表示（教材名・カテゴリバッジ・進捗バー） | クリックでセッション詳細ダイアログ（下記）を開く |

割当自体は1件以上あるが、すべて全セッション完了済みの場合は割当セット行が0件になり、
「All assigned sets are completed」と表示される（完了済みセットの内容は「Manage」から確認する）。

「+ Assign」から開く教材選択ダイアログの挙動（カテゴリタブ・既割当教材の除外等）は、
管理画面と全く同じもの（コンポーネントを共有）。詳細は
[Dialogue Practice管理画面の仕様書](dialogue-practice.md) を参照。

### セッション詳細ダイアログ

割当セット行をクリックすると開く。教材名・カテゴリバッジ・進捗（「n/m sessions completed」）を
ヘッダーに表示し、その下にセット内の全セッション行が並ぶ。この行は管理画面の展開カードと
同じ`DialogueSessionRow`を共有しており、完了/取消の切り替え・教材リンク・メモ入力と保存は
管理画面と全く同じ挙動。**割当解除（Unassign）はこのダイアログには無く、管理画面でのみ行える**。

## Coach Notes カード

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| メモ入力欄＋「Save Note」 | 常時表示 | 空欄で保存しようとするとエラートースト。保存すると一覧の先頭に追加され、入力欄はクリアされる |
| 「View all notes」リンク | 常時 | コーチノート一覧（`/students/[id]/coach-notes`）へ遷移 |
| メモ行（最大5件、新しい順） | 折りたたみ表示（1行プレビュー）。クリックで展開し全文＋登録日時を表示 | メモは自分のみ閲覧可能で、追記のみ（編集・削除機能は無い） |

## Training Reports カード

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 「View all reports」リンク | 常時 | トレーニングレポート一覧（`/students/[id]/training-reports`）へ遷移 |
| 契約ごとの行（直近5契約） | 契約期間・プラン名。自分のレポート（無ければ「Add your comment」のプレースホルダー）＋分担コーチの確定済みレポート（あれば）を表示 | 行をクリックして展開し、コメントの作成・下書き保存・確定（Finalize）を行う |
| 「Finalize Report」 | 自分のレポートが未確定の場合のみ | 確認ダイアログの上で確定。**確定後は自分を含め誰も編集できなくなる** |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| Live Sessionsカードが空 | 「No live session contracts yet」 | この生徒に契約が1件も無い場合 |
| Live Sprintカードが空 | 「No lesson sprints yet」 | Live Sprint実施記録が1件も無い場合 |
| Dialogue Practiceカードが空 | 「No dialogue sets assigned yet」 | ダイアログプラクティス教材が1件も割り当てられていない場合 |
| Dialogue Practiceカードの割当セット行が0件 | 「All assigned sets are completed」 | 割当は1件以上あるが、いずれも全セッション完了済みの場合 |
| Coach Notesカードが空 | 「No notes yet」 | メモが1件も無い場合 |
| Training Reportsカードが空 | 「No contracts yet」 | 契約が1件も無い場合 |
| 読み込み中（遷移直後） | 一覧→概要の遷移直後はカード群の骨組み、その後ヘッダーを先に表示し、各カードは取得が終わった順に骨組みから置き換わる | ヘッダー（`getStudentOverview` / `getStudentUpcomingSession`）の取得後、カードごとに個別の `Suspense` で遅延表示 |
| 生徒が見つからない/担当関係が無い | 404ページ | 指定した生徒IDに対して自分が一度も担当関係を持ったことが無い場合 |

過去に担当していた生徒（現在は担当関係が終了、`is_active=false`）についても、この概要画面
自体は引き続き閲覧できる（コーチ交代時の引き継ぎ目的）。

## 関連する業務フロー仕様書

- [個別予約リクエスト・振替候補フロー](../../../testing/e2e/specs/booking/individual-booking-and-reschedule.md)
  — Live Sessionsカードの「Cancel」から行うキャンセル・振替候補提案が、相手側の承諾・却下を
  経てどう確定するか、異常系の一覧

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/[id]/page.tsx`
- `apps/coach/app/(app)/students/[id]/_components/OverviewSections.tsx`（カード単位のデータ取得。page.tsx が各カードを `Suspense` で包む）
- `apps/coach/app/(app)/students/[id]/_components/StudentOverviewHeader.tsx`
- `apps/coach/app/(app)/students/[id]/_components/SprintProgressRadar.tsx`
- `apps/coach/app/(app)/students/[id]/_components/StageLevelDialog.tsx`
- `apps/coach/app/(app)/students/[id]/_components/TodaysLessonPanel.tsx`
- `apps/coach/app/(app)/students/[id]/_components/LiveSessionHistoryCard.tsx`
- `apps/coach/app/(app)/students/[id]/_components/LessonSprintCard.tsx`
- `apps/coach/app/(app)/students/[id]/_components/LessonSprintHistoryRow.tsx`
- `apps/coach/app/(app)/students/[id]/_components/DialoguePracticeCard.tsx`（詳細は
  [Dialogue Practice管理画面の仕様書](dialogue-practice.md) を参照。セッション詳細ダイアログは
  `dialogue-practice/_components/DialogueSessionRow.tsx`を共有。[セッションハブ](session-detail.md)
  にも同じコンポーネントが埋め込まれている）
- `apps/coach/app/(app)/students/[id]/_components/CoachNotesCard.tsx` / `CoachNoteEntry.tsx`
- `apps/coach/app/(app)/students/[id]/_components/TrainingReportCard.tsx` /
  `TrainingReportContractRow.tsx` / `TrainingReportEntry.tsx`
- 共通ダイアログ: `apps/coach/app/(app)/calendar/_components/SessionActionDialog.tsx`
  （実体は `packages/lib/components/common/SessionActionDialog.tsx`）
- 関連RPC: `cancel_session`, `check_session_conflict`
- サーバーアクション: `getStudentOverview`, `getStudentLiveSessionContracts`,
  `getStudentSessionsByTicket`, `getStudentUpcomingSession`, `getStudentLiveSessionShortfalls`,
  `getStudentNotes`, `addCoachStudentNote`, `getContractTrainingReports`,
  `saveContractTrainingReportDraft`, `finalizeContractTrainingReport`,
  `updateStudentSprintLevel`, `forceStageUpStudent`, `getLessonSprintHistory`
  （`apps/coach/actions/studentAction.ts`, `apps/coach/actions/lessonSprintAction.ts`）
- Dialogue Practiceカード用: `getStudentDialogueAssignments`, `getAvailableDialogueContents`,
  `assignDialogueContent`（`apps/coach/actions/dialogueAction.ts`。詳細は
  [Dialogue Practice管理画面の仕様書](dialogue-practice.md) を参照）
