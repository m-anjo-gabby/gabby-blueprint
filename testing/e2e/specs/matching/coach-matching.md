# 専属コーチのマッチング（空き時間・申請・承認／否認／取消）

## 概要

ライブセッション付き契約の生徒が、契約の週あたりのコマ（`slot_no`）ごとに、コーチの空き時間から「毎週◯曜◯時」を選んで担当を申請し、コーチが承認すると定期スケジュールと契約期間分のセッションが作られる。
申請の曜日・時刻は申請時の生徒のタイムゾーンで固定し、夏時間の切り替えをまたいでも生徒側の時刻は全回同じになる（コーチ側の時刻は変わり得る）。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| コーチ | 対応可能時間帯の設定 | `coach` `/availability` | `AvailabilityView.tsx`。画面仕様: [docs/screens/coach/availability.md](../../../../docs/screens/coach/availability.md) |
| 生徒 | 専属コーチを探す | `student` `/coach-matching` | `RequestDialog.tsx`, `createMatchingRequest`, `cancelMatchingRequest`。画面仕様: [docs/screens/student/coach-matching.md](../../../../docs/screens/student/coach-matching.md) |
| コーチ | 申請一覧（カレンダーの Pending Requests も同じカード） | `coach` `/matching-requests` | `MatchingRequestCard.tsx`, `approveMatchingRequest`, `rejectMatchingRequest`。画面仕様: [docs/screens/coach/matching-requests.md](../../../../docs/screens/coach/matching-requests.md) |
| アドミン | ライブセッション管理（直接マッチング・コーチ交代） | `admin` `/live-sessions` | [admin/live-session-management.md](../admin/live-session-management.md) を参照（本書の対象外） |

## 前提条件

- 生徒: 有効なライブ付き契約のライセンスとチケット（`com_t_user_session_ticket`。`weekly_frequency` がコマ数）。開始前の次の契約でも申請できる。
- コーチ: 有効なコーチプロフィール（`com_m_coach_profile.delete_flg = '0'`）と、1件以上の空き時間。デモコーチ（`demo_user`）はデモの生徒にだけ対象になる（`get_matchable_coach_ids`）。
- アカウント: 申請〜承認はデータを作るため、使い捨ての生徒・コーチを都度作る（[FIXTURES.md](../../../FIXTURES.md)「アカウントの種類と使い分け」）。固定アカウントは閲覧の確認だけに使う。

## 時刻の基準

| データ | 基準 |
|---|---|
| 空き時間 `com_m_coach_availability` | UTC の曜日・時刻（日の終わりは `24:00:00`。UTC で日をまたぐ時間帯は日ごとの2行）。コーチの画面は表示時点の時差で現地時刻に換算する |
| 申請 `com_t_matching_request` | 生徒の現地の曜日・時刻＋ `requested_timezone`（申請時の生徒の `com_m_user.timezone`。サーバー側で取得） |
| 定期スケジュール `com_m_lesson_schedule` | 申請の値を引き継ぐ（`schedule_timezone`）。2026-10-06 より前の成立分はコーチのタイムゾーン |
| セッション `com_t_session` | UTC。`schedule_timezone` の現地時刻で各回を作る（`fn_generate_sessions_for_schedule`） |

## フロー（正常系）

1. コーチが空き時間を登録する（現地時刻で編集し、UTC に換算して保存）。保存すると確認日時（`availability_confirmed_at`）が更新される。
2. 生徒が契約（既定は現在の契約）を選び、コーチカードの「カレンダーからリクエストする」でダイアログを開く。空き時間は生徒のタイムゾーンで〇（申請可）／×（確定済み・承認待ちの枠と重なる）表示。
3. 生徒が枠を選び「リクエストを送信」→ 申請が承認待ち（status=1）で作られ、その枠は「承認待ち」になる。コーチへの通知は無い（コーチはカレンダーの Pending Requests・サイドバーの件数で気付く）。
4. 分岐
   - 4a. コーチが承認 → 申請は承認（2）。定期スケジュール（status=1）を作り、契約期間内・`target_sessions` 件まで、開始が24時間以上先の回のセッションを作る（アドミンの代理承認は24時間の下限なし）。生徒×コーチの1対1チャットルームを用意してコーチ名義の挨拶を送り、生徒へ `MATCHING_APPROVED` を通知する。
   - 4b. コーチが否認（理由必須）→ 否認（3）。生徒へ `MATCHING_REJECTED` を通知し、生徒の枠に「前回否認理由」を表示する。同じ枠に再申請できる。
   - 4c. 生徒が承認待ちを取消 → 取消（4）。枠は未マッチングに戻る。
5. コーチの空き時間の見直し: 毎日 00:15 UTC に、空き時間があり最終確認から14日を過ぎたコーチへ「見直し」、空き時間が0件のコーチへ「登録」を促すアプリ内通知（`COACH_AVAILABILITY_REMINDER`、メールなし）を出す。同じコーチへは14日に1回。空き時間の保存・「No changes needed」で確認済みになり、通知は既読になる。

status 値の意味: [_GLOSSARY.md](../_GLOSSARY.md#com_t_matching_requeststatus初回マッチング申請)

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | ライブ付き契約の有効なチケットが無い生徒が画面を開く | 「この機能はライブセッション付きプランの方のみ…」のみ表示 | UI |
| 2 | 通常の生徒がデモコーチへ申請（コーチIDを直接指定） | 「この操作を行う権限がありません。」（`not_eligible`） | RPC（UI導線なし） |
| 3 | 他人のチケット、またはコマ数を超える `slot_no` で申請 | `not_eligible`（RLS でも他人のチケットへの登録は拒否） | RPC（UI導線なし） |
| 4 | 申請した枠の初回の回（24時間以上先・契約開始以降）がコーチの空き時間（UTC）に収まらない | `invalid_input`（「希望時間がコーチの対応可能時間内に収まっているか…」） | RPC（UI導線なし） |
| 5 | 契約期間内に申請した枠の回が無い（初回が契約終了より後） | `invalid_input` | RPC（UI導線なし） |
| 6 | コーチの稼働中の定期スケジュールと、契約期間内のいずれかの回が実際の日時で重なる | 申請時: 「この時間帯はコーチの既存の予約と重複しています…」（`schedule_conflict`）／承認時: `SCHEDULE_CONFLICT` で承認できない（コーチには個別調整を促す文言） | 両方 |
| 7 | 同じ契約・同じコマに承認待ち／承認済みの申請がある状態で再申請 | 「この枠は既にマッチング済み、または承認待ちのリクエストがあります。」（一意制約 23505） | 両方 |
| 8 | 承認待ちでない申請の承認・否認・取消 | 承認・否認: RPC がエラー（not pending）／取消: `invalid_input`（更新0件） | RPC |
| 9 | 宛先コーチ以外（アドミンを除く）が承認・否認 | 権限エラー（`fn_assert_actor_or_admin`） | RPC（UI導線なし） |
| 10 | 否認理由が空 | UI:「Please enter a reason for rejecting this request.」／RPC: `reject_reason is required` | 両方 |
| 11 | 夏時間のあるコーチ（例: ニューヨーク）× 日本時間の生徒で、契約が切り替え（北米は11月第1日曜）をまたぐ | 全回が生徒側で同じ時刻。コーチの承認カードに切り替え後のコーチ側の時刻を "From {日付}: …" で併記 | 両方 |
| 12 | 2つの承認がほぼ同時に同じコーチで走り、互いに重なる | コーチ単位のロックで直列化され、後の承認は #6 と同じく失敗 | RPC |

## 関連RPC・テーブル

- RPC: `approve_matching_request`, `reject_matching_request`, `check_coach_schedule_conflict`, `get_coaches_unavailable_slots`, `get_matchable_coach_ids`, `confirm_my_coach_availability`
- 内部関数: `fn_commit_matching_schedule`, `fn_generate_sessions_for_schedule`, `fn_weekly_occurrences`, `fn_send_matching_greeting`, `enqueue_coach_availability_reminders`（pg_cron `coach-availability-reminders-daily`）
- テーブル: `com_m_coach_availability`, `com_t_matching_request`, `com_m_lesson_schedule`, `com_t_session`, `com_m_coach_profile`（`availability_confirmed_at`）, `com_t_notification`
- 実装参照: `packages/lib/matching/actions/matchingActions.ts`, `packages/lib/coachAvailability/actions/coachAvailabilityActions.ts`, `apps/student/actions/matchingAction.ts`, `apps/coach/actions/matchingRequestAction.ts`, `apps/coach/actions/availabilityAction.ts`, 換算 `packages/lib/date/date.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 申請した生徒の時刻で全回が予約される | 実装済み: `e2e/tests/matching/matching-request-timezone.spec.ts`（#11 の生徒側。コーチの承認は本人のログインで RPC） |
| 高 | 現在の契約・次の契約の切替 | 実装済み: `e2e/tests/matching/coach-matching-contracts.spec.ts` |
| 中 | 否認 → 前回否認理由の表示 → 同じ枠へ再申請 | #4b・#7 の解除 |
| 中 | 承認待ちの取消 | #4c |
| 中 | 重なる枠の申請・承認が拒否される | #6（データを直接作って申請・承認を呼ぶ） |
| 低 | コーチの空き時間の見直し通知 | 対象・14日の間隔・保存で既読（コーチアプリは E2E 未導入のため RPC・データで確認） |
