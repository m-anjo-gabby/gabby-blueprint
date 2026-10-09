# 専属コーチのマッチング（空き時間・申請・承認／否認／取り下げ／期限切れ）

## 概要

ライブセッション付き契約の生徒が、契約の週あたりのコマ（`slot_no`）ごとに、コーチの空き時間から「毎週◯曜◯時」を選んで担当を申請し、コーチが承認すると定期スケジュールと契約期間分のセッションが作られる。
申請の曜日・時刻は申請時の生徒のタイムゾーンで固定し、夏時間の切り替えをまたいでも生徒側の時刻は全回同じになる（コーチ側の時刻は変わり得る）。
申請の回答期限は24時間で、過ぎると無効になる（下記「回答期限」）。
契約期間内の全ての回を予約できなくても、予約できる回数が割合以上なら申請・承認でき、重なる回は未予約として残して生徒とコーチが個別に日時を調整する（下記「予約できる回数の判定」）。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| コーチ | 対応可能時間帯の設定 | `coach` `/availability` | `AvailabilityView.tsx`。画面仕様: [docs/screens/coach/availability.md](../../../../docs/screens/coach/availability.md) |
| 生徒 | 専属コーチを探す | `student` `/coach-matching` | `RequestDialog.tsx`, `getMatchingSlotOptions`, `createMatchingRequest`, `withdrawMatchingRequest`。画面仕様: [docs/screens/student/coach-matching.md](../../../../docs/screens/student/coach-matching.md) |
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

## 予約できる回数の判定

申請時（生徒）・承認時（コーチ）・申請カレンダーの表示は、すべて DB の `fn_matching_slot_availability` で数える。アドミンの直接マッチングはイレギュラーな対応のため割合の基準を適用しない（重なる回は飛ばして作り、予約できる回が0回の場合だけ `NO_BOOKABLE_SESSION` で成立しない）。

| 値 | 意味 |
|---|---|
| 目標回数 | コマの契約上の回数（`total_sessions / weekly_frequency`、余りは若いコマに1回ずつ）から、コーチ交代等で終了した同じコマの定期スケジュールで既に使った回（実施済み・予約済み・返還なしのキャンセル）を引いた残り（`fn_matching_slot_target_sessions`）。残りが0回のコマは成立しない（`NO_REMAINING_SESSIONS`）。生徒のハブの「コーチ未選択」の回数も同じ数え方 |
| 実施できる回 | 申請・承認から24時間以降、契約終了までの毎週の回 |
| 予約できる回 | 実施できる回のうち、次のどれとも重ならない回（上限は目標回数）: コーチまたは生徒の予約済みのセッション（個別予約・振替を含む）／コーチまたは生徒の稼働中の定期スケジュールの毎週の枠／生徒自身の承認待ちの申請の枠／コーチの休み（BLOCK）／**申請時だけ**: 同じコーチ宛ての他の生徒の承認待ちの申請の枠。承認待ちの申請は、その申請の契約期間内の回だけを重なりと数える。他の生徒の承認待ちを承認時に数えないのは、重なる申請が既にある場合にどちらも承認できなくなるため（後から申請できないので、通常は重ならない） |
| 必要な回数 | min(目標回数, 実施できる回) × 割合 の切り上げ。割合は DB の `matching_min_bookable_rate()`（初期値 0.8。変更は関数の作り直しだけで、アプリの変更は不要） |

- 予約できる回 = 目標回数: 〇（全ての回を予約）。
- 必要な回数 ≦ 予約できる回 < 目標回数: △（申請・承認できる。未予約の回は個別に調整）。契約の残り期間が足りない分は、どの枠を選んでも変わらないため割合の判定には含めず、未予約として表示だけする。
- 予約できる回 < 必要な回数、または実施できる回が0: ×（申請・承認できない）。
- 例: 12回のコマで割合 0.8 なら10回以上、0.7 なら9回以上。
- 承認時に作るセッションは、同じ判定で重なる回を飛ばして目標回数まで作る（`fn_generate_sessions_for_schedule`）。申請時に予約できた回数は `com_t_matching_request.requested_bookable_sessions` に残し、コーチの承認カードで現在の回数と並べる。

## 回答期限

- 申請の登録時にトリガーが回答期限 `expires_at` = 登録時刻＋ `matching_request_ttl()`（24時間。変更は関数の作り直しだけで、登録済みの申請の期限は変わらない）を入れる（クライアントの値は使わない）。
- 期限を過ぎた承認待ちは、pg_cron `matching-requests-expire`（毎分）の `fn_expire_matching_requests` が期限切れ（status=6）にし、生徒へ `MATCHING_EXPIRED` を通知する（アプリ内＋メール）。
- 期限切れの処理までの間（最大1分）も、承認・否認・取り下げは `EXPIRED` で拒否し、予約できる回数の判定・コーチの承認待ちの一覧・生徒の枠の状況は期限を過ぎた申請を承認待ちとして扱わない。
- 同じ契約・同じコマへ申請し直す時は、登録の直前に同じコマの期限切れを処理する（承認待ち・承認済みは1件の一意制約に、期限切れの処理前の行が残って申請し直せない、を防ぐ）。

## フロー（正常系）

1. コーチが空き時間を登録する（現地時刻で編集し、UTC に換算して保存）。保存すると確認日時（`availability_confirmed_at`）が更新される。
2. 生徒が契約（既定は現在の契約）を選び、コーチカードの「カレンダーからリクエストする」でダイアログを開く。空き時間は生徒のタイムゾーンで表示し、開いた時点（コマを切り替えた時点）で候補ごとの予約できる回数を取得して〇／△／×を出す（取得中は選べない）。
3. 生徒が枠を選ぶと「このコマのN回のうちM回を予約します」を出す。△の枠は未予約の回数と内訳（他の予定と重なる回・契約の残り期間に入りきらない回）を出し、「未予約の回を個別に調整することを了承しました」に印を付けるまで送信できない。「リクエストを送信」→ サーバーで予約できる回数を数え直し、割合以上なら承認待ち（status=1）で作られ、その枠は「承認待ち」とコーチの回答期限を表示する。宛先コーチへ `MATCHING_REQUESTED`（回答期限つき）を通知する（アプリ内＋メール。リンクは `/matching-requests`）。
4. 分岐
   - 4a. コーチが承認 → 承認カードには「今承認した場合に予約できる回数」（申請時の回数との比較、内訳）を出す。割合以上なら申請は承認（2）。定期スケジュール（status=1）を作り、契約期間内・`target_sessions` 件まで、開始が24時間以上先で他の予定と重ならない回のセッションを作る（アドミンの代理承認は24時間の下限なし）。生徒×コーチの1対1チャットルームを用意してコーチ名義の挨拶を送り、生徒へ `MATCHING_APPROVED` を通知する（payload に予約できた回数 `booked_sessions` と目標回数 `target_sessions`。未予約の回が残る場合は本文で日時のリクエストを案内し、通知メールも同じ本文）。
   - 4b. コーチが否認（理由必須）→ 否認（3）。生徒へ `MATCHING_REJECTED` を通知し、生徒の枠に「前回否認理由」を表示する。同じ枠に再申請できる。
   - 4d. コーチが24時間以内に対応しない → 期限切れ（6）。枠は未マッチングに戻り「前回のリクエストは、コーチの回答期限（24時間）を過ぎたため無効になりました…」を表示する。生徒へ `MATCHING_EXPIRED` を通知する（アプリ内＋メール）。同じ枠に再申請できる。
   - 4c. 生徒が承認待ちを取り下げ（確認ダイアログあり。`withdraw_matching_request`）→ 取り下げ（4）。枠は未マッチングに戻り、別のコーチ・時間で申請し直せる。コーチへ `MATCHING_WITHDRAWN` をアプリ内で通知する（メールなし）。
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
| 6 | 予約できる回数が必要な回数に満たない（コーチ・生徒の他の予定、コーチの休みと重なる回が多い） | 申請時: カレンダーで×（選べない）。直接呼んだ場合は「この時間帯は、契約期間内に予約できる回数が足りません…」（`insufficient_bookable`）／承認時: `INSUFFICIENT_BOOKABLE` で承認できない（承認カードは承認ボタンを無効にし、否認して別の時間を選んでもらうよう案内） | 両方 |
| 6b | 申請から承認までにコーチの予定が埋まり、予約できる回数が申請時より減ったが割合以上 | 承認カードに「Fewer lessons than when the student requested…」を出し、承認できる。成立通知の回数は承認時の値 | 両方 |
| 7 | 同じ契約・同じコマに承認待ち／承認済みの申請がある状態で再申請 | 「この枠は既にマッチング済み、または承認待ちのリクエストがあります。」（一意制約 23505） | 両方 |
| 8 | 承認待ちでない申請の承認・否認・取り下げ | 承認・否認: RPC がエラー（not pending。承認は `not_pending` の文言）／取り下げ: 「このリクエストは既にコーチが対応済みです…」（`NOT_PENDING`） | RPC |
| 9 | 宛先コーチ以外（アドミンを除く）が承認・否認 | 権限エラー（`fn_assert_actor_or_admin`） | RPC（UI導線なし） |
| 10 | 否認理由が空 | UI:「Please enter a reason for rejecting this request.」／RPC: `reject_reason is required` | 両方 |
| 11 | 夏時間のあるコーチ（例: ニューヨーク）× 日本時間の生徒で、契約が切り替え（北米は11月第1日曜）をまたぐ | 全回が生徒側で同じ時刻。コーチの承認カードに切り替え後のコーチ側の時刻を "From {日付}: …" で併記 | 両方 |
| 12 | 2つの承認がほぼ同時に同じコーチで走り、互いに重なる | コーチ単位のロックで直列化され、後の承認は重なる回を数え直す（#6 の判定。割合未満なら失敗） | RPC |
| 15 | 回答期限（24時間）を過ぎた申請の承認・否認・取り下げ（期限切れの処理の前を含む） | `EXPIRED`。コーチ:「This request has expired because it was not answered within 24 hours…」／生徒:「このリクエストは回答期限（24時間）を過ぎたため、既に無効になっています…」 | RPC |
| 13 | 他人の申請の取り下げ | 権限エラー（`fn_assert_actor_or_admin`） | RPC（UI導線なし） |
| 14 | 同じコーチ宛ての他の生徒の承認待ちの申請と重なる枠（その申請の契約期間内） | 重なる回は予約できない回と数え、割合未満ならカレンダーで×（コーチが同じ枠の申請を並べて迷うこと・否認による生徒の印象の悪化を避けるため、申請自体をさせない） | 両方 |

## 関連RPC・テーブル

- 回答期限: `matching_request_ttl`, `fn_expire_matching_requests`（pg_cron `matching-requests-expire`）、トリガー `trg_matching_request_before_insert`（期限の設定・同じコマの期限切れの処理）・`trg_matching_request_after_insert`（コーチへの通知）
- RPC: `approve_matching_request`, `reject_matching_request`, `withdraw_matching_request`, `get_matching_slot_options`（生徒: 候補ごとの回数）, `get_matching_request_availability`（コーチ: 承認待ちの回数）, `get_matchable_coach_ids`, `confirm_my_coach_availability`
- 判定: `matching_min_bookable_rate`（割合）, `fn_matching_slot_availability`, `fn_matching_slot_target_sessions`, `fn_matching_occurrence_busy`（2026-10-09 から。旧 `check_coach_schedule_conflict`・`get_coaches_unavailable_slots` は削除）
- 内部関数: `fn_commit_matching_schedule`, `fn_generate_sessions_for_schedule`, `fn_weekly_occurrences`, `fn_send_matching_greeting`, `enqueue_coach_availability_reminders`（pg_cron `coach-availability-reminders-daily`）
- テーブル: `com_m_coach_availability`, `com_t_matching_request`, `com_m_lesson_schedule`, `com_t_session`, `com_m_coach_profile`（`availability_confirmed_at`）, `com_t_notification`
- 実装参照: `packages/lib/matching/actions/matchingActions.ts`, `packages/lib/coachAvailability/actions/coachAvailabilityActions.ts`, `apps/student/actions/matchingAction.ts`, `apps/coach/actions/matchingRequestAction.ts`, `apps/coach/actions/availabilityAction.ts`, 換算 `packages/lib/date/date.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 申請した生徒の時刻で全回が予約される | 実装済み: `e2e/tests/matching/matching-request-timezone.spec.ts`（#11 の生徒側。コーチの承認は本人のログインで RPC） |
| 高 | 現在の契約・次の契約の切替 | 実装済み: `e2e/tests/matching/coach-matching-contracts.spec.ts` |
| 高 | コーチの画面での承認・否認 | 実装済み: `e2e/tests/coach/matching-requests.spec.ts`（4a・4b・#10。承認でスケジュールとセッションが作られ、否認は理由つきで履歴に出る。生徒の申請は本人のログインで直接登録） |
| 中 | 否認 → 前回否認理由の表示 → 同じ枠へ再申請 | #4b・#7 の解除 |
| 高 | コーチ交代後の再マッチングで契約の回数を超えない | 実装済み: `e2e/tests/matching/matching-bookable-rate.spec.ts`（実施済み4回の後にコーチ交代→別のコーチで成立すると目標回数は残りの8回） |
| 高 | 申請の回答期限（24時間） | 実装済み: `e2e/tests/matching/matching-request-expiry.spec.ts`（コーチへの期限つきの通知・メールの積み込み、期限後の承認不可（#15）と生徒の画面の表示、期限切れの処理と生徒への通知、期限直後の申請し直し。期限は `expires_at` を書き換えて確かめる） |
| 高 | 予約できる回数の割合での申請・承認、取り下げ | 実装済み: `e2e/tests/matching/matching-bookable-rate.spec.ts`（〇△×の表示、△の了承、送信直後の取り下げとコーチへの通知、申請後に予定が埋まると承認不可（#6）、重なる回を飛ばした成立と通知の回数、他の生徒の承認待ちと重なる枠は×（#14）、アドミンの直接マッチングは割合の基準なし・0回なら不可。コーチの予定は休みで作る） |
| 中 | コーチの空き時間の保存・確認・削除 | 実装済み: `e2e/tests/coach/availability.spec.ts`（手順1・5。現地時刻で選んだ枠が UTC で保存され、保存・「No changes needed」で確認日時が更新される） |
| 低 | コーチの空き時間の見直し通知 | 対象・14日の間隔・保存で既読（pg_cron の処理は RPC・データで確認し、保存・「No changes needed」はコーチの画面で確認） |
