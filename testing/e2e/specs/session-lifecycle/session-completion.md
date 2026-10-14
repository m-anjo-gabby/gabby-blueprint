# ライブセッションの実施・終了処理（通話・End Session・アドミンの修正）

## 概要

実施予定のライブセッション1件を、通話（入退室の記録）→ コーチの終了操作（End Session）で確定する。
結果は**コーチの申告を正**とし、入退室の重なりから推定した結果は End Session のダイアログの初期選択と、確認の材料（推定と違う印）に使う。
アプリの通話が使えず外部のZoomで実施した場合も、同じ End Session で「実施方法: 外部のZoom」として記録する（代替措置として認める。理由は必須）。
確定後の誤りの修正や、コーチが記録しないまま残ったセッションの確定はアドミンが行う（ライブセッション管理・実施記録）。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| コーチ | セッションハブ | `coach` `/students/[id]/sessions/[sessionId]` | `SessionHub.tsx`, `components/session/EndSessionDialog.tsx`。画面仕様: [docs/screens/coach/students/session-detail.md](../../../../docs/screens/coach/students/session-detail.md) |
| コーチ | セッション結果 | `coach` `/students/[id]/sessions/[sessionId]/result` | 確定後の記録の確認。画面仕様: [docs/screens/coach/students/session-result.md](../../../../docs/screens/coach/students/session-result.md) |
| コーチ | ダッシュボード（Session Tasks） | `coach` `/dashboard` | `getMySessionTasks`。画面仕様: [docs/screens/coach/dashboard.md](../../../../docs/screens/coach/dashboard.md) |
| コーチ・生徒 | 通話ルーム | `coach` `/students/[id]/room/[sessionId]`、`student` `/live-room/[sessionId]` | `record_session_call_join` / `record_session_call_leave`。画面仕様: [docs/screens/student/live-room/call-room.md](../../../../docs/screens/student/live-room/call-room.md) |
| 生徒 | セッション結果 | `student` `/live-room/sessions/[sessionId]/result` | 画面仕様: [docs/screens/student/live-room/session-result.md](../../../../docs/screens/student/live-room/session-result.md) |
| アドミン | ライブセッション管理・実施記録 | `admin` `/live-sessions`、`/live-sessions/records` | `CorrectOutcomeDialog.tsx`, `getSessionRecordList`。画面仕様: [docs/screens/admin/live-sessions.md](../../../../docs/screens/admin/live-sessions.md) |

## 前提条件

- 実施予定（`status=1`）のセッション。定期スケジュール（担当枠）から作られたもの、または個別予約で作られたもの（[booking/individual-booking-and-reschedule.md](../booking/individual-booking-and-reschedule.md)）。
- アカウント: 終了処理はデータを変えるため、使い捨ての生徒・コーチを都度作る（`e2e/support/liveSessionFixtures.ts`）。E2E では通話ルームを開かず、入退室ログ（`com_t_session_call_log`）を直接入れて通話した状態を作る（[CONVENTIONS.md](../../CONVENTIONS.md) 2章）。

## 時間の基準

| 項目 | 値 | 定義 |
|---|---|---|
| 通話に入れる時刻 | 開始予定の5分前から | `LIVE_SESSION_EARLY_JOIN_BEFORE_MS`（コーチ・生徒とも入室情報の取得時にサーバーで確認） |
| 通話の残り時間の警告・自動終了 | 生徒の入室から25分で警告、30分で自動終了 | `LIVE_SESSION_WARNING_AFTER_MS` / `LIVE_SESSION_END_AFTER_MS`（起点はブラウザの時刻） |
| End Session で記録できる時刻 | 開始予定時刻から | `record_session_outcome`（開始前の欠席・中止はキャンセルで扱う） |
| ハブで通話・Live Sprint を新しく始められる期間 | 終了予定から30分後まで | `LIVE_SESSION_END_AFTER_MS`。過ぎると End Session だけになる |
| 推定で「実施完了」とする重なり | 20分以上 | `fn_session_outcome_evidence` |

いずれの分数も各アプリの環境変数（`NEXT_PUBLIC_LIVE_SESSION_*_MINUTES`）で上書きできる（`packages/lib/liveSessionRoom/constants.ts`）。

## 結果の種類

| End Session の結果 | 記録 | チケット | 月次の稼働 | 生徒への通知 |
|---|---|---|---|---|
| 実施完了 | `status=2`, `completion_result=1` | 消化 | 数える | なし |
| 生徒の都合で早く終了（理由必須） | `status=2`, `completion_result=2` | 消化 | 数える（要確認の印） | なし |
| 生徒の欠席 | `status=2`, `completion_result=3` | 消化 | 数える（要確認の印） | なし（生徒の画面では「未参加」と表示） |
| コーチの欠席（理由必須） | `status=3`, `cancel_category=2`, 返還 | 消化しない（振替の対象） | 数えない | `SESSION_CANCELLED_BY_COACH` |
| 通信トラブル等で実施できなかった（理由必須） | `status=3`, `cancel_category=6`, 返還 | 消化しない（振替の対象） | 数えない | なし |

- 結果が実施完了・早期終了・欠席の場合は**実施方法**（アプリ内の通話／外部のZoom）も記録する（`conducted_via`）。初期値はコーチの入室記録があればアプリ内、無ければ外部のZoom。
- コーチの欠席と通信トラブル等はチケットの扱いが同じだが、コーチへの支払いの判断が変わりうるため区別して記録する。
- 用語・値: [_GLOSSARY.md](../_GLOSSARY.md#com_t_sessionstatusセッション本体)

## フロー（正常系）

1. コーチ・生徒が通話ルームに入ると、入室ごとに入退室ログが1行作られる（役割はセッションのコーチ／生徒から決まる）。退室で `left_at` が入る。同じ人が何度入り直しても行が増える。
2. コーチがハブで End Session を押すと、ダイアログが開き、入退室ログからの推定（`get_session_outcome_evidence`）を取得する。
   - 2a. 根拠（「同時に在室 n分」「生徒は入室していない」「コーチはアプリの通話に入っていない」）を表示する。
   - 2b. 推定（重なり20分以上 → 実施完了 / 20分未満で生徒の入室あり → 早期終了 / 生徒の入室なし → 生徒の欠席 / コーチの入室記録なし → 推定なしで実施完了）を初期選択にし、推定の選択肢に「Suggested by call log」の印を付ける。
3. コーチが結果・実施方法・理由を選んで記録する（`record_session_outcome`）。次の場合は理由が必須（画面と RPC で同じ条件。`packages/lib/session/outcome.ts`）。
   - 早期終了・コーチの欠席・通信トラブル等
   - 外部のZoomで実施した
   - アプリ内の通話で実施したと申告し、結果が推定と違う（コーチの入室記録が無い場合を含む）。この場合は `outcome_mismatch` = true になる
4. 記録の時点の推定を `suggested_outcome` に残し、チケットを消化する結果なら `fn_consume_session_ticket` で1回消化して `ticket_consumed` = true にする。記録は `com_t_session_outcome_history` に `recorded` として残る。
5. 実施した結果（実施完了・早期終了・欠席）はセッション結果画面へ移り、宿題を投稿する（[homework/session-homework.md](../homework/session-homework.md)）。コーチの欠席・通信トラブル等は生徒概要へ戻る。
6. 終了予定を過ぎても実施予定のままのセッションは、コーチのダッシュボードの Session Tasks に「End Session needed」として出る。確定から14日以内で宿題の無い実施済みセッションは「Homework not posted」として出る（実施結果の内訳を問わない）。
7. 月次の稼働実績では、`status=2` のセッションは内訳を問わず件数に入り、早期終了・欠席・外部のZoomでの実施・推定と違う結果は要確認として印が付く（`get_coach_monthly_sessions`）。

### アドミンの修正

8. アドミンはライブセッション管理（生徒・契約単位。実施済みタブの「結果を記録」「結果を修正」）または実施記録（`/live-sessions/records`。全生徒・全コーチ横断）から、開始済みのセッションの結果を記録・修正する（`admin_correct_session_outcome`）。
   - 8a. 対象: 未記録のまま終了予定を過ぎたもの、`status=2`、`status=3` かつ `cancel_category=2/6`。理由は常に必須。
   - 8b. チケットは `ticket_consumed` との差分で消化・返還する（返還は `fn_restore_session_ticket`。チケット履歴に `restored`）。
   - 8c. 生徒・コーチへの通知は送らない。履歴に `corrected` として残り、`outcome_mismatch` は false に戻る。
   - 8d. 同じ結果のまま保存し直すと「アドミン確認済み」になり、実施記録の「要確認」から外れる。
9. 実施記録の「要確認」: 未記録・早期終了・欠席・外部のZoom・推定と違う・コーチの欠席・通信トラブル等のうち、アドミンがまだ修正・確認していないもの（`admin_get_session_records`）。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 開始予定より前に End Session | 「You can record the outcome once the session has started …」を出し、ダイアログを開かない（RPC: `session has not started yet`） | 両方 |
| 2 | 理由が必須の条件（上記3）で理由が空 | Record Outcome を押せない（RPC: `reason required for this outcome`） | 両方 |
| 3 | 別のタブで先に記録済みのセッションで記録 | エラーのトーストを出し、ハブを「This lesson has already been finalized.」の表示に切り替える（RPC: `not scheduled`） | 両方 |
| 4 | セッションの担当コーチ以外が `record_session_outcome`（アドミンを含む） | `not authorized to record this session` | RPC（UI導線なし） |
| 5 | 実施完了・早期終了・欠席で実施方法が無い | `invalid conducted_via` | RPC（UIは常に指定） |
| 6 | アドミンの修正で、開始前のセッション・生徒のキャンセル・アドミンの代理キャンセル・自動キャンセルを指定 | `session has not started yet` / `session outcome cannot be corrected` | RPC（UIは対象外の行にボタンを出さない） |
| 7 | アドミン以外が `admin_correct_session_outcome` / `admin_get_session_records` | 権限エラー（`fn_assert_actor_or_admin`） | RPC（UI導線なし） |
| 8 | 過去の契約を選んだライブセッション管理 | 「結果を記録」「結果を修正」を出さない（参照のみ。修正は実施記録から） | UI |
| 9 | 開始予定の5分より前に通話へ入る | ハブでは「Not yet — you can start at …」を出して開かない。入室情報の取得は `not_yet_available` | 両方 |
| 10 | 終了予定から30分を過ぎてハブを開く | Start Live Session と Training が消え、End Session だけになる | UI |

## 関連RPC・テーブル

- RPC: `record_session_outcome`, `get_session_outcome_evidence`, `admin_correct_session_outcome`, `admin_get_session_records`, `record_session_call_join`, `record_session_call_leave`, `get_coach_monthly_sessions`
- 内部関数: `fn_session_outcome_evidence`, `fn_apply_session_outcome`, `fn_consume_session_ticket`, `fn_restore_session_ticket`, `fn_assert_actor_or_admin`, `fn_notify`
- テーブル: `com_t_session`（`status`・`completion_result`・`cancel_category`・`conducted_via`・`suggested_outcome`・`outcome_mismatch`・`ticket_consumed`・`status_note`）, `com_t_session_outcome_history`, `com_t_session_call_log`, `com_t_user_session_ticket`（`used_sessions`）, `com_t_user_session_ticket_history`
- 実装参照: `packages/lib/session/outcome.ts`（理由が必須の条件・初期値）, `packages/lib/components/common/SessionOutcomeFields.tsx`（コーチ・アドミン共通の入力欄）, `packages/lib/session/actions/sessionActions.ts`（`recordSessionOutcomeCore`・`getSessionOutcomeEvidenceCore`）, `packages/lib/session/actions/sessionTaskActions.ts`, `apps/admin/actions/adminLiveSessionAction.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 推定どおりの実施完了でチケットを消化する | 実装済み: `e2e/tests/journeys/coach-live-session.spec.ts`（ジャーニーの手順7） |
| 高 | 重なり20分未満は早期終了が初期選択・理由必須で、チケットを消化する | 実装済み: `e2e/tests/session/session-completion.spec.ts`（2b・3） |
| 高 | 外部のZoom・推定と違う結果・コーチの欠席・通信トラブル等 | 実装済み: 同ファイル（実施方法の初期値・理由・`outcome_mismatch`・返還・通知の有無・履歴） |
| 高 | アドミンが未記録のセッションを記録し、修正でチケットの消化・返還が差分で反映される | 実装済み: `e2e/tests/admin/live-session-outcome-correction.spec.ts`（8・9） |
| 中 | 生徒の入室なしで欠席が初期選択（理由不要・通知なし） | 実装済み: `e2e/tests/session/session-completion.spec.ts` |
| 中 | 開始前の End Session | 実装済み: 同ファイル（#1） |
| 低 | 別タブで記録済みのセッションの End Session | #3 |
