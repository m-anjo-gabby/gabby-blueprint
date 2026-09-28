# コーチノート一覧（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/students/[id]/coach-notes`
- 対象ロール: コーチ
- 目的: 生徒概要画面の「Coach Notes」カードでは直近5件しか見えないメモ全件を、この画面で
  確認する。

## この画面に来る経路

- 生徒概要画面（`/students/[id]`）のCoach Notesカードにある「View all notes」リンクから遷移する

## 画面の構成

1. **ヘッダー** — 「← Back to Overview」リンクと「Coach Notes — {生徒名}」という見出し
2. **メモ一覧** — 登録日時順（新しい順）の全件リスト

生徒概要のCoach Notesカードと異なり、この画面には新規メモの入力欄は無い（新規追加は概要画面
側でのみ行う、閲覧専用の一覧画面）。

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| メモ行 | 折りたたみ表示。閉じた状態では登録日時＋本文1行プレビュー | クリックで展開し、全文を表示する（編集・削除は不可） |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 空 | 「No notes yet」 | この生徒についてのメモが1件も無い場合 |
| 生徒が見つからない/担当関係が無い | 404ページ | 指定した生徒IDに対して自分が一度も担当関係を持ったことが無い場合 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/[id]/coach-notes/page.tsx`
- `apps/coach/app/(app)/students/[id]/coach-notes/_components/CoachNotesHistoryList.tsx`
- `apps/coach/app/(app)/students/[id]/_components/CoachNoteEntry.tsx`（生徒概要カードと共用）
- サーバーアクション: `getStudentOverview`, `getStudentNotes`（`apps/coach/actions/studentAction.ts`）
