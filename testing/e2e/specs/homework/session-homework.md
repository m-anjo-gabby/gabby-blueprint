# ライブセッションの宿題（本体・チェックリスト・フォローアップコメント）

## 概要

コーチがライブセッション1件につき1つの宿題（指示文・添付・チェックリスト）を投稿し、生徒はチェックリストの完了を付けていく。投稿後の本体・チェックリストは変更できず、コーチは追記のコメント（本文・添付）だけを何度でも送れる。投稿とコメントは生徒へ通知（メールを含む）する。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| コーチ | セッション結果（宿題の投稿・コメント） | `coach` `/students/[id]/sessions/[sessionId]/result` | `HomeworkComposer.tsx`, `createSessionHomework`, `addHomeworkComment`, `uploadSessionHomeworkAttachment`。画面仕様: [docs/screens/coach/students/session-result.md](../../../../docs/screens/coach/students/session-result.md) |
| コーチ | セッションハブ（前回の宿題） | `coach` `/students/[id]/sessions/[sessionId]` | `LastHomeworkList.tsx`, `getRecentSessionHomework`。画面仕様: [docs/screens/coach/students/session-detail.md](../../../../docs/screens/coach/students/session-detail.md) |
| コーチ | ダッシュボード（Homework not posted） | `coach` `/dashboard` | `getMySessionTasks`。画面仕様: [docs/screens/coach/dashboard.md](../../../../docs/screens/coach/dashboard.md) |
| 生徒 | セッション結果（宿題の確認・チェック） | `student` `/live-room/sessions/[sessionId]/result` | `updateHomeworkChecklistItemStatus`。画面仕様: [docs/screens/student/live-room/session-result.md](../../../../docs/screens/student/live-room/session-result.md) |

## 前提条件

- 宿題を付けるセッションの担当コーチであること。画面の導線は確定済みのセッションの結果画面だけ（[session-lifecycle/session-completion.md](../session-lifecycle/session-completion.md)）。サーバー側はセッションの状態を確認しない。
- アカウント: 投稿はデータを変えるため、使い捨ての生徒・コーチを都度作る（`e2e/support/liveSessionFixtures.ts`）。

## 制限

| 項目 | 値 | 定義 |
|---|---|---|
| 宿題本体 | 1セッションにつき1件 | `com_t_session_homework.session_id` の一意制約 |
| チェックリスト | 最大5項目（本体と同時に作り、後から追加・変更できない） | `HOMEWORK_CHECKLIST_MAX_ITEMS`（`packages/types/sessionHomework.ts`） |
| 添付ファイル | 1ファイル10MBまで。画像（png/jpeg/webp/gif）・PDF・テキスト・Word・Excel | `HOMEWORK_ATTACHMENT_MAX_SIZE` / `HOMEWORK_ATTACHMENT_ALLOWED_MIME_TYPES`。保存先は Storage の `homework` バケット |

## フロー（正常系）

1. コーチが結果画面の New Homework に指示文（必須）・添付・チェックリスト項目を入れて「Post Homework」を押す。添付は選んだ時点で先にアップロードし、本体・チェックリスト・添付をまとめて登録する。
2. 登録すると生徒へ `HOMEWORK_POSTED` を通知する（リンクは生徒のセッション結果画面。メールの対象: [notification/mail-dispatch.md](../notification/mail-dispatch.md)）。コーチの結果画面は投稿済みの表示（Instructions / Checklist / Follow-up Comments）に切り替わる。
3. 生徒がセッション結果画面で宿題を確認し、チェックリストの項目を完了／未完了に切り替える（生徒が変えられるのは完了状態だけ）。全項目が完了すると完了のメッセージが出る。コーチの画面には進捗（n/m done）が出る。
4. コーチが追記のコメント（本文または添付のどちらかは必須）を送ると、生徒の画面に追加され、同じ `HOMEWORK_POSTED` の通知が更新されて未読に戻る（1セッションにつき通知は1件）。
5. 次回のセッションのハブの Last Homework に、このセッションの宿題が「前回の宿題」として出る（そのハブのセッション自身の宿題を除く）。
6. 確定から14日以内で宿題の無い実施済みセッションは、コーチのダッシュボードの Session Tasks に「Homework not posted」として出る。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 指示文が空 | Post Homework を押せない（サーバー: `invalid_input`） | 両方 |
| 2 | チェックリストが6項目以上 | 入力欄が5項目で消える（サーバー: `invalid_input`） | 両方 |
| 3 | 同じセッションに2件目の本体を投稿 | `already_exists`（一意制約） | RPC（UI導線なし。投稿後はフォームが消える） |
| 4 | 担当コーチ以外が投稿・コメント・添付のアップロード | `forbidden`（RLS の登録条件でも拒否） | RPC（UI導線なし） |
| 5 | 本体が無いセッションにコメント | `not_found` | RPC（UI導線なし） |
| 6 | 本文も添付も無いコメント | 送信ボタンを押せない（サーバー: `invalid_input`） | 両方 |
| 7 | 10MBを超える、または許可されていない形式の添付 | アップロードを拒否する（メッセージは日本語のまま。coach の画面は英語表記が原則） | 両方 |
| 8 | 生徒が他の生徒の宿題のチェックリスト項目を更新 | `forbidden`（RLS の対象生徒本人の条件と、完了状態の列だけの更新権限） | RPC（UI導線なし） |
| 9 | 生徒がチェックリストの更新に失敗 | エラーのトーストを出し、チェックを操作前に戻す | UI |

## 関連RPC・テーブル

- RPC: なし（サーバーアクションから RLS の範囲でテーブルを直接更新）
- トリガー: `notify_session_homework_posted` / `notify_session_homework_comment_posted`（どちらも `HOMEWORK_POSTED`、重複キーは `session_id`）
- テーブル: `com_t_session_homework`, `com_t_session_homework_checklist_item`, `com_t_session_homework_comment`, `com_t_session_homework_attachment`, `com_t_notification`
- 実装参照: `packages/lib/sessionHomework/actions/sessionHomeworkActions.ts`, `packages/lib/sessionHomework/actions/homeworkAttachmentActions.ts`, `packages/types/sessionHomework.ts`, `apps/coach/actions/sessionHomeworkAction.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 指示文とチェックリストを付けて投稿する | 実装済み: `e2e/tests/journeys/coach-live-session.spec.ts`（ジャーニーの手順10） |
| 高 | 生徒が通知から宿題を開き、チェックリストを完了する | 2〜3。生徒の画面で全項目を完了し、コーチの画面の進捗に反映される |
| 中 | 追記のコメントで通知が未読に戻る | 4 |
| 中 | 前回の宿題が次回のハブに出る | 5（ジャーニーでは前回の宿題を直接作って表示だけ確かめている） |
| 低 | 添付の形式・サイズの制限 | #7 |
