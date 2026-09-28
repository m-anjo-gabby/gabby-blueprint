# 担当生徒一覧（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/students`
- 対象ロール: コーチ
- 目的: 自分が現在・過去に担当した生徒の一覧を確認し、生徒詳細（`/students/[id]`）へ遷移する。

## この画面に来る経路

- コーチアプリのサイドナビゲーション「My Students」から遷移する（本画面自体がこの領域の入口）。

## 画面の構成

1. **見出し** — 「My Students」というタイトルと、「Students currently and previously matched
   with you. Select a student to view sprint progress, live session history, and your private
   notes in one place.」という説明文
2. **Active Students セクション** — 現在担当中の生徒をカード形式で表示（件数を見出しに表示）
3. **Past Students セクション** — 過去に担当していた（現在は担当関係が終了した）生徒をカード形式で
   表示。0件の場合はセクションごと非表示

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 生徒カード | 生徒ごとに1枚。アバター、氏名、「週n回×Stage n」、現在/直近の契約カード（プラン名・期間）、次回セッション日時（あれば） | カードをクリックすると `/students/[id]`（生徒概要画面）へ遷移する |
| 契約カードのバッジ | 現在有効な契約がある生徒は「Current Contract」を緑系で、無い生徒は「Last Contract」（直近の過去契約）または「No contract yet」を灰色系で表示 | 操作なし（表示のみ） |
| 「Next: 日時」表示 | その生徒に次回実施可能な（実施予定かつ終了予定時刻が未来の）セッションがある場合のみ | 操作なし |
| 「Show all n past students」ボタン | Past Studentsが11件以上あり、まだ全件表示していない場合のみ表示 | 押すとPast Studentsを全件展開表示する |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 生徒が1人もいない | 「No students assigned yet」「Students will appear here once a matching request is approved.」 | 現在・過去含めて担当生徒が0人の場合 |
| Active Studentsが0件（Pastはいる） | 「No active students right now.」 | 現在担当中の生徒がおらず、過去の担当生徒のみいる場合 |

Active Studentsは氏名の昇順、Past Studentsは直近の契約終了日が新しい順（直近であるほどケアが
必要な可能性が高いため）で並ぶ。並び替えのUIは無く、常に固定順。

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/students/page.tsx`
- `apps/coach/app/(app)/students/_components/StudentListView.tsx`
- `apps/coach/app/(app)/students/_components/StudentCard.tsx`
- サーバーアクション: `getAssignedStudents`（`apps/coach/actions/studentAction.ts`、実体は
  `getAssignedStudentsCore` in `packages/lib/coachStudent/actions/coachStudentActions.ts`）
