# ライブセッションの実施・終了処理（通話・End Session・手動確定）

## 概要

実施予定のライブセッション1件を、通話（入退室の記録）→ コーチの終了操作（End Session）で確定する。確定時に入退室の重なりから実施結果（実施完了・早期終了・無断欠席）を自動で決め、実施完了だけチケットを1回消化する。
通話の記録が無いまま終了予定を過ぎたセッションは、コーチが理由を付けて手動で確定する（Resolve Manually）。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| コーチ | セッションハブ | `coach` `/students/[id]/sessions/[sessionId]` | `SessionHub.tsx`, `useEndLesson.ts`, `EndLessonReasonDialog.tsx`, `SessionActionDialog.tsx`（`mode: 'resolve'`）。画面仕様: [docs/screens/coach/students/session-detail.md](../../../../docs/screens/coach/students/session-detail.md) |
| コーチ | セッション結果 | `coach` `/students/[id]/sessions/[sessionId]/result` | 確定後の記録の確認。画面仕様: [docs/screens/coach/students/session-result.md](../../../../docs/screens/coach/students/session-result.md) |
| コーチ | ダッシュボード（Session Tasks） | `coach` `/dashboard` | `getMySessionTasks`。画面仕様: [docs/screens/coach/dashboard.md](../../../../docs/screens/coach/dashboard.md) |
| コーチ・生徒 | 通話ルーム | `coach` `/students/[id]/room/[sessionId]`、`student` `/live-room/[sessionId]` | `record_session_call_join` / `record_session_call_leave`。画面仕様: [docs/screens/student/live-room/call-room.md](../../../../docs/screens/student/live-room/call-room.md) |
| 生徒 | セッション結果 | `student` `/live-room/sessions/[sessionId]/result` | 画面仕様: [docs/screens/student/live-room/session-result.md](../../../../docs/screens/student/live-room/session-result.md) |

## 前提条件

- 実施予定（`status=1`）のセッション。定期スケジュール（担当枠）から作られたもの、または個別予約で作られたもの（[booking/individual-booking-and-reschedule.md](../booking/individual-booking-and-reschedule.md)）。
- アカウント: 終了処理はデータを変えるため、使い捨ての生徒・コーチを都度作る（`e2e/support/liveSessionFixtures.ts`）。E2E では通話ルームを開かず、入退室ログ（`com_t_session_call_log`）を直接入れて通話した状態を作る（[CONVENTIONS.md](../../CONVENTIONS.md) 2章）。

## 時間の基準

| 項目 | 値 | 定義 |
|---|---|---|
| 通話に入れる時刻 | 開始予定の5分前から | `LIVE_SESSION_EARLY_JOIN_BEFORE_MS`（コーチ・生徒とも入室情報の取得時にサーバーで確認） |
| 通話の残り時間の警告・自動終了 | 生徒の入室から25分で警告、30分で自動終了 | `LIVE_SESSION_WARNING_AFTER_MS` / `LIVE_SESSION_END_AFTER_MS`（起点はブラウザの時刻） |
| ハブで通話・Live Sprint を新しく始められる期間 | 終了予定から30分後まで | `LIVE_SESSION_END_AFTER_MS`。過ぎると End Session だけになる |
| 実施完了とみなす重なり | 20分以上 | `finalize_session` |

いずれの分数も各アプリの環境変数（`NEXT_PUBLIC_LIVE_SESSION_*_MINUTES`）で上書きできる（`packages/lib/liveSessionRoom/constants.ts`）。

## フロー（正常系）

1. コーチ・生徒が通話ルームに入ると、入室ごとに入退室ログが1行作られる（役割はセッションのコーチ／生徒から決まる）。退室で `left_at` が入る。同じ人が何度入り直しても行が増える。
2. コーチがハブで End Session を押す（コーチが一度でも入室していないと押せない）。確認ダイアログの後に `finalize_session` を呼ぶ。
3. コーチと生徒の在室区間の重なりの合計（退室が記録されていない区間は現在時刻まで）で結果を決める。
   - 3a. 20分以上 → 実施完了（`completion_result=1`）。チケットを1回消化し（`used_sessions` +1）、チケット履歴に `consumed` を記録する。
   - 3b. 20分未満で生徒の入室あり → 理由の入力ダイアログを出し、理由を付けて再実行すると早期終了（`2`。理由は `status_note`）。チケットは消化しない。
   - 3c. 生徒の入室なし → 無断欠席（`3`）。チケットは消化しない。
4. 確定後はセッション結果画面へ移り、宿題を投稿する（[homework/session-homework.md](../homework/session-homework.md)）。
5. 通話の記録が無いまま終了予定を過ぎたセッション（アプリ外で実施した、End Session を押し忘れた等）は、ハブの Resolve Manually で理由を付けて確定する（`resolve_stale_session`。コーチが入室していない場合だけボタンが出る）。
   - 5a. 「Completed (conducted outside the app)」→ 実施完了。チケットを1回消化する（理由はチケット履歴の備考にも残る）。
   - 5b. 「No-show」→ 無断欠席。
   - 5c. 「I missed this session」→ コーチ起因のキャンセル（`status=3`、`cancel_category=2`、チケット返還）。生徒へ `SESSION_CANCELLED_BY_COACH` を通知し、ハブからは生徒概要へ戻る（他は結果画面へ）。
6. 終了予定を過ぎても実施予定のままのセッションは、コーチのダッシュボードの Session Tasks に「End Session needed」として出る。確定から14日以内で宿題の無い実施済みセッションは「Homework not posted」として出る（実施結果の内訳を問わない）。
7. 月次の稼働実績では、確定したセッションは実施結果の内訳を問わず件数に入り、早期終了・無断欠席は要確認として印が付く（`get_coach_monthly_sessions`）。

status 値の意味: [_GLOSSARY.md](../_GLOSSARY.md#com_t_sessionstatusセッション本体)

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | コーチが一度も入室していない状態で End Session | ボタンが押せない（「Join the call at least once before ending the session」） | UI |
| 2 | 重なり20分未満・生徒の入室ありで、理由なしで終了 | 理由の入力ダイアログが出る（RPC: `reason required for early-ended session`）。理由が空のままでは Submit できない | 両方 |
| 3 | 別のタブで先に確定済みのセッションで End Session | エラーのトーストを出し、ハブを「This lesson has already been finalized.」の表示に切り替える（RPC: `not scheduled`） | 両方 |
| 4 | セッションの担当コーチ以外が End Session（アドミンを含む） | `not authorized to finalize this session` | RPC（UI導線なし） |
| 5 | 終了予定より前に Resolve Manually | `cannot resolve a session before its end time`（UI はボタン自体を出さない） | 両方 |
| 6 | Resolve Manually の理由が空 | 送信できない（RPC: `reason required to resolve a stale session`） | 両方 |
| 7 | Resolve Manually を担当コーチ・アドミン以外が実行 | 権限エラー（`fn_assert_actor_or_admin`） | RPC（UI導線なし） |
| 8 | Resolve Manually で早期終了（`p_resolution=2`）を指定 | 早期終了として確定する（UI の選択肢には無い） | RPC（UI導線なし） |
| 9 | 開始予定の5分より前に通話へ入る | ハブでは「Not yet — you can start at …」を出して開かない。入室情報の取得は `not_yet_available` | 両方 |
| 10 | 終了予定から30分を過ぎてハブを開く | Start Live Session と Training が消え、End Session だけになる | UI |

## 関連RPC・テーブル

- RPC: `finalize_session`, `resolve_stale_session`, `record_session_call_join`, `record_session_call_leave`, `get_coach_monthly_sessions`
- 内部関数: `fn_consume_session_ticket`, `fn_assert_actor_or_admin`, `fn_notify`
- テーブル: `com_t_session`（`status`・`completion_result`・`status_note`）, `com_t_session_call_log`, `com_t_user_session_ticket`（`used_sessions`）, `com_t_user_session_ticket_history`
- 実装参照: `packages/lib/session/actions/sessionActions.ts`（`finalizeSessionCore`・`resolveStaleSessionCore`）, `packages/lib/session/actions/sessionTaskActions.ts`, `packages/lib/liveSessionRoom/actions/liveSessionRoomActions.ts`, `packages/lib/liveSessionRoom/constants.ts`, `apps/coach/hooks/useEndLesson.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | End Session で実施完了になり、チケットを消化する | 実装済み: `e2e/tests/journeys/coach-live-session.spec.ts`（ジャーニーの手順8） |
| 高 | 重なり20分未満は理由を入力して早期終了（消化しない） | 実装済み: 同ファイルの2つ目のテスト（#2） |
| 中 | 生徒の入室なしで無断欠席 | 3c。入退室ログをコーチ分だけ入れる |
| 中 | Resolve Manually の3つの結果 | 5a〜5c。終了予定を過ぎたセッション（入退室ログなし）で、チケットの消化・返還と生徒への通知を確かめる |
| 低 | 別タブで確定済みのセッションの End Session | #3 |
