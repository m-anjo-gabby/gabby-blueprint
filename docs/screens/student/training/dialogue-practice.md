# ダイアログ専用画面（studentアプリ）

## 概要

- アプリ: `student`
- パス: `/training/dialogue/[assignmentId]`
- 対象ロール: 生徒（本人への割当のみ閲覧可能）
- 目的: コーチに割り当てられたダイアログ教材セットの進捗確認と、セッション別の教材リンクへの
  アクセス（宿題としての自主トレーニング・完了済みセットの復習の両方で使う）。進捗の記録・
  コーチメモの編集はコーチ側のみの機能のため、本画面は読み取り専用。

## この画面に来る経路

- ライブラリ画面（`/library`）のダイアログ教材カードの「Start Training」ボタンから遷移する
  （`assignment_id`単位で遷移するため、同じ生徒でも割当ごとに別のURLになる）。
- ダッシュボード（ホーム）の「今日やること」（未完了の課題が主役になった場合）、または
  「コーチからの課題」カードから遷移する。

## 画面の構成

1. **ヘッダー** — 戻るボタン、画面タイトル「ダイアログ」
2. **課題の概要カード** — 教材名、カテゴリバッジ、割当日、進捗バー
3. **セッション一覧** — セット内のセッションごとに1枚のカード。完了バッジ・完了日・教材リンク

アプリシェル内の画面で、共通ナビゲーションは「学習」タブがアクティブになる。

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 戻るボタン | 常時 | 直前の画面（ライブラリまたはホーム）へ戻る。履歴が無い場合はライブラリ画面（`/library`）へ遷移 |
| 画面タイトル「ダイアログ」 | 常時。戻るボタンと同じ行に表示 | 操作なし |
| 教材名 | 常時。ライブラリの教材カード見出しと同じ大きさで表示し、長い場合は省略せず折り返す | 操作なし |
| カテゴリバッジ（Beginner／Intermediate／Advanced／Corpus） | 常時 | 操作なし |
| 割当日 | 常時 | 操作なし |
| 進捗バー＋「n/m 完了」 | 常時 | 操作なし（完了セッション数の自動集計） |
| セッション行 | セット内のセッションごとに1行表示 | 下記「セッション行」参照 |

### セッション行

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 完了バッジ | 完了時のみ「セッション n」の隣に緑の「完了」バッジを表示（未完了時はバッジ無し） | 表示のみ |
| 完了日 | 完了時のみ「完了日: yyyy-mm-dd」を表示 | 表示のみ |
| 「教材を開く」リンク | 生徒用教材リンクが登録されているセッションのみ | 新しいタブで教材（Google Slides想定。将来別形式もありうるため文言をスライド限定にしていない）を開く |
| 「教材は未登録です」 | 生徒用教材リンクが未登録のセッション | 表示のみ |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 割当が見つからない | 404ページ | `assignmentId`が自分自身の有効な割当と一致しない場合（他ユーザーの割当ID、割当解除済み、誤ったIDを直接指定した場合など） |

## 補足（設計上の注意点）

- コーチ側の管理画面（[Dialogue Practice管理画面](../../coach/students/dialogue-practice.md)）と
  異なり、進捗の完了操作・コーチメモの表示編集は行わない（読み取り専用）。進捗の記録は引き続き
  コーチ側の画面でのみ行う。
- コーチ用教材はセッションごとに別ファイル（別URL）だが、生徒用教材はセット内の全セッションで
  同一URL（同一ファイル）を想定した設計になっている。ただし将来セッションごとにURLが分かれる
  可能性を考慮し、UI上はセッション単位でリンクを個別表示している。
- データ取得はコーチ側（`getStudentDialogueAssignmentsCore`）と共通のロジック
  （`fetchDialogueAssignmentSummaries`）を再利用しており、RLSの「本人閲覧可」ポリシー
  （`com_t_dialogue_assignment` / `com_t_dialogue_session_progress`）により自分自身の割当のみが
  返る。studentアプリからのコーチ担当関係チェックは不要（行の所有者=自分自身のため）。
- ライブラリ画面の一覧取得（`getAllContent`）でも、ダイアログはこの画面と同じ割当ベースの
  ロジックで絞り込まれている（[ライブラリ画面の仕様書](../library.md)を参照）。

## 実装参照（エンジニア向け）

- `apps/student/app/(app)/(shell)/training/dialogue/[assignmentId]/page.tsx`
- `apps/student/app/(app)/(shell)/training/dialogue/[assignmentId]/_components/DialoguePracticeDetail.tsx`
- `apps/student/app/(app)/(shell)/training/dialogue/[assignmentId]/_components/DialogueSessionRow.tsx`
- 遷移元: `apps/student/app/(app)/(shell)/library/page.tsx`（`packages/lib/navigation/student-path.ts`の
  `getTrainingPath`が`content_type===3`の場合にこの画面へのパスを生成する）
- 関連アクション: `getMyDialogueAssignments`（`apps/student/actions/dialogueAction.ts` →
  Core実装は`packages/lib/coachStudent/actions/dialogueActions.ts`の
  `getMyDialogueAssignmentsCore`）
- DB: `com_m_contents`（`content_type=3`）, `com_m_dialogue_session`,
  `com_t_dialogue_assignment`, `com_t_dialogue_session_progress`
