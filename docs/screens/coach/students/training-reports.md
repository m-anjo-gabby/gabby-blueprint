# トレーニングレポート一覧（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/students/[id]/training-reports`
- 対象ロール: コーチ
- 目的: 生徒概要画面の「Training Reports」カードでは直近5契約分しか見えないレポートを、
  この画面で契約全件について確認・編集・確定する。

## この画面に来る経路

- 生徒概要画面（`/students/[id]`）のTraining Reportsカードにある「View all reports」リンクから
  遷移する

## 画面の構成

1. **ヘッダー** — 「← Back to Overview」リンクと「Training Reports — {生徒名}」という見出し
2. **契約別レポート一覧** — 生徒概要画面と同じ表示・編集コンポーネントを、対象を全契約に
   広げて表示する

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 契約行 | 契約期間・プラン名。現在有効な契約には「Current」バッジ | — |
| 自分のレポート | 未作成の場合は「Add your comment」のプレースホルダー、下書き中は「Draft」バッジ、確定済みは「Finalized」バッジ（鍵アイコン付き） | 行をクリックして展開し、コメントを編集できる（確定済みは編集不可） |
| 「Save Draft」ボタン | 自分のレポートが未確定の場合 | 入力内容を下書き保存する（生徒には公開されない） |
| 「Finalize Report」ボタン | 自分のレポートが未確定の場合 | 確認ダイアログ（「Once finalized, this comment can no longer be edited by anyone.」）の上で確定する。確定と同時に未保存の下書きも保存される |
| 分担コーチのレポート | 週2回契約等で他コーチと分担している場合、そのコーチの確定済みレポートのみ表示 | 閲覧のみ（編集不可） |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 空 | 「No contracts yet」 | この生徒に契約が1件も無い場合 |
| 生徒が見つからない/担当関係が無い | 404ページ | 指定した生徒IDに対して自分が一度も担当関係を持ったことが無い場合 |

確定済みレポート（Finalized）は、確定した本人を含め誰も編集できなくなる。この制限を解除する
UI操作は無い。

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/[id]/training-reports/page.tsx`
- `apps/coach/app/(app)/students/[id]/training-reports/_components/TrainingReportHistoryList.tsx`
- `apps/coach/app/(app)/students/[id]/_components/TrainingReportContractRow.tsx`（生徒概要カードと共用）
- `apps/coach/app/(app)/students/[id]/_components/TrainingReportEntry.tsx`
- サーバーアクション: `getStudentOverview`, `getStudentLiveSessionContracts`,
  `getContractTrainingReports`, `saveContractTrainingReportDraft`,
  `finalizeContractTrainingReport`（`apps/coach/actions/studentAction.ts`）
