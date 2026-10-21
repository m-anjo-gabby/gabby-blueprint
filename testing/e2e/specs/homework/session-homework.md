# ライブセッションの宿題（本体・フォローアップコメント・生徒の閲覧）

## 概要

コーチがライブセッション1件につき1つの宿題（指示文・添付）を投稿する。投稿後の本体は変更できず、コーチは追記のコメント（本文・添付）だけを何度でも送れる。投稿とコメントは生徒へ通知（メールを含む）する。
進捗は、生徒が宿題を開いたこと（生徒のセッション結果画面を開いた時刻）を自動で記録してコーチの画面に出す（生徒の操作は不要）。チェックリストは廃止した（2026-10-14）。
宿題を出さない回は、コーチが「今回は宿題なし」にできる。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| コーチ | セッション結果（宿題の投稿・コメント・今回は宿題なし） | `coach` `/students/[id]/sessions/[sessionId]/result` | `HomeworkComposer.tsx`, `components/session/HomeworkViewedStatus.tsx`, `createSessionHomework`, `addHomeworkComment`, `setSessionHomeworkNotNeeded`, `uploadSessionHomeworkAttachment`（`apps/coach/actions/sessionHomeworkAction.ts`。失敗理由のコードを英語の文言にする）。画面仕様: [docs/screens/coach/students/session-result.md](../../../../docs/screens/coach/students/session-result.md) |
| コーチ | セッションハブ（前回の宿題） | `coach` `/students/[id]/sessions/[sessionId]` | `LastHomeworkList.tsx`, `getRecentSessionHomework`。画面仕様: [docs/screens/coach/students/session-detail.md](../../../../docs/screens/coach/students/session-detail.md) |
| コーチ | ダッシュボード（Homework not posted） | `coach` `/dashboard` | `getMySessionTasks`。画面仕様: [docs/screens/coach/dashboard.md](../../../../docs/screens/coach/dashboard.md) |
| 生徒 | セッション結果（宿題の確認） | `student` `/live-room/sessions/[sessionId]/result` | `markSessionHomeworkViewed`（画面をサーバーで描く時に記録）、表示は `components/session/SessionHomeworkContent.tsx`。画面仕様: [docs/screens/student/live-room/session-result.md](../../../../docs/screens/student/live-room/session-result.md) |
| 生徒 | ホーム（ライブセッションのカードの前回の宿題） | `student` `/dashboard` | `LatestHomeworkBlock.tsx`, `getMyLatestSessionHomework`（表示中の契約の最新の宿題）、シートを開いた時に `markSessionHomeworkViewed`。画面仕様: [docs/screens/student/dashboard.md](../../../../docs/screens/student/dashboard.md) |

## 前提条件

- 宿題を付けるセッションの担当コーチであること。画面の導線は確定済みのセッションの結果画面だけ（[session-lifecycle/session-completion.md](../session-lifecycle/session-completion.md)）。サーバー側はセッションの状態を確認しない（「今回は宿題なし」だけは実施済みの回に限る）。
- アカウント: 投稿はデータを変えるため、使い捨ての生徒・コーチを都度作る（`e2e/support/liveSessionFixtures.ts`）。

## 制限

| 項目 | 値 | 定義 |
|---|---|---|
| 宿題本体 | 1セッションにつき1件 | `com_t_session_homework.session_id` の一意制約 |
| 添付ファイル | 1ファイル10MBまで。画像（png/jpeg/webp/gif）・PDF・テキスト・Word・Excel | `HOMEWORK_ATTACHMENT_MAX_SIZE` / `HOMEWORK_ATTACHMENT_ALLOWED_MIME_TYPES`。保存先は Storage の `homework` バケット |

## フロー（正常系）

1. コーチが結果画面の New Homework に指示文（必須）・添付を入れて「Post Homework」を押す。添付は選んだ時点で先にアップロードし、本体・添付をまとめて登録する。
2. 登録すると生徒へ `HOMEWORK_POSTED` を通知する（リンクは生徒のセッション結果画面。メールの対象: [notification/mail-dispatch.md](../notification/mail-dispatch.md)）。コーチの結果画面は投稿済みの表示（Instructions / Follow-up Comments）に切り替わり、「Not viewed by the student yet」が出る。
3. 生徒がセッション結果画面を開く、またはホームの「前回の宿題」のシートを開くと、宿題を開いた日時（`student_viewed_at`）を記録する（`mark_session_homework_viewed`。結果画面は開くたびに更新、ホームは未読・新しい追記がある時だけ）。コーチの結果画面とハブの Last Homework に「Viewed by the student · 日時」が出る。
4. コーチが追記のコメント（本文または添付のどちらかは必須）を送ると、生徒の画面に追加され、同じ `HOMEWORK_POSTED` の通知が更新されて未読に戻る（1セッションにつき通知は1件）。生徒が最新のコメントより後に開いていなければ、コーチの画面に「your latest comment isn’t viewed yet」が添えられる。
5. 次回のセッションのハブの Last Homework に、このセッションの宿題が「前回の宿題」として出る（そのハブのセッション自身の宿題を除く）。
6. 確定から14日以内で宿題の無い実施済みセッションは、コーチのダッシュボードの Session Tasks に「Homework not posted」として出る。生徒の欠席（`completion_result=3`）の回と、コーチが結果画面で「No homework this time」にした回（`com_t_session.homework_not_needed`）は出ない。「Post homework instead」で取り消すと投稿のフォームに戻る。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 指示文が空 | Post Homework を押せない（サーバー: `invalid_input`） | 両方 |
| 2 | 同じセッションに2件目の本体を投稿 | `already_exists`（一意制約） | RPC（UI導線なし。投稿後はフォームが消える） |
| 3 | 担当コーチ以外が投稿・コメント・添付のアップロード・「今回は宿題なし」 | `forbidden`（RLS の登録条件・RPC の担当コーチの確認でも拒否） | RPC（UI導線なし） |
| 4 | 本体が無いセッションにコメント | `not_found` | RPC（UI導線なし） |
| 5 | 本文も添付も無いコメント | 送信ボタンを押せない（サーバー: `invalid_input`） | 両方 |
| 6 | 10MBを超える、または許可されていない形式の添付 | アップロードを拒否し、ファイル名と理由（英語）をトーストで出す（サーバーは理由のコード `file_too_large` / `unsupported_type` を返す） | 両方 |
| 7 | 実施済みでない回に「今回は宿題なし」 | ボタンを出さない（RPC: `is not completed`） | 両方 |
| 8 | 生徒以外（コーチ・アドミン）が生徒の結果画面に相当する記録を呼ぶ | 何もしない（`mark_session_homework_viewed` は対象の生徒本人の行だけを更新する） | RPC |

## 関連RPC・テーブル

- RPC: `mark_session_homework_viewed`, `set_session_homework_not_needed`（投稿・コメントはサーバーアクションから RLS の範囲でテーブルを直接更新）
- トリガー: `notify_session_homework_posted` / `notify_session_homework_comment_posted`（どちらも `HOMEWORK_POSTED`、重複キーは `session_id`）
- テーブル: `com_t_session_homework`（`student_viewed_at`）, `com_t_session_homework_comment`, `com_t_session_homework_attachment`, `com_t_session`（`homework_not_needed`）, `com_t_notification`
- 実装参照: `packages/lib/sessionHomework/actions/sessionHomeworkActions.ts`, `packages/lib/sessionHomework/actions/homeworkAttachmentActions.ts`（`uploadSessionHomeworkAttachmentCore`）, `packages/lib/session/actions/sessionTaskActions.ts`, `packages/types/sessionHomework.ts`, `apps/coach/actions/sessionHomeworkAction.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 指示文を付けて投稿する | 実装済み: `e2e/tests/journeys/coach-live-session.spec.ts`（ジャーニーの手順8。投稿直後は「Not viewed by the student yet」） |
| 高 | 生徒が通知から宿題を開くと、コーチの画面に「見た」と出る | 実装済み: `e2e/tests/homework/session-homework.spec.ts`（2〜3。結果画面と次回のハブ） |
| 中 | 追記のコメントで通知が未読に戻り、生徒が開くまで「最新の追記を見ていない」と出る | 実装済み: 同上（4） |
| 中 | 前回の宿題が次回のハブに出る | 実装済み: 同上（5） |
| 中 | 欠席の回・「今回は宿題なし」の回は Homework not posted に出ない | 実装済み: 同上（6・取り消し） |
| 中 | 生徒のホームに前回の宿題が新着で出て、シートで開くと見たことが記録される | 実装済み: 同上 |
| 低 | 添付の形式・サイズの制限 | #6 |
