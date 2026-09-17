# 個別予約リクエスト・振替候補フロー

## 概要

生徒がコーチの承認を得て個別に日時を確定させる2つのフローを扱う。①生徒が既存の
定期コマの未消化枠を使って自由な日時を提案する「個別予約リクエスト」と、②既存
セッションのキャンセルに伴い代替日時を提案し合う「振替候補提案」。いずれも
「相手の承認/承諾を要する日時提案」という同一のデータモデル（`com_t_session_slot_proposal`）
で扱われる。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント |
|---|---|---|---|
| 生徒 | カレンダー | apps/student `/calendar` | `BookMakeupSessionDialog.tsx`（個別予約リクエストの作成） |
| 生徒 | ライブルーム | apps/student `/live-room` | `LiveSessionHub.tsx`（セッションキャンセル）、`RescheduleProposalDialog.tsx`（振替候補への応答） |
| コーチ | カレンダー（保留中パネル） | apps/coach `/calendar` | `PendingRequestsPanel.tsx` |
| コーチ | 申請一覧 | apps/coach `/matching-requests` | `BookingRequestCard.tsx`（予約リクエスト）、`RescheduleProposalRequestCard.tsx`（振替候補） |

## 前提条件

- 生徒は有効な契約・コマ（`com_m_lesson_schedule`）を持ち、当該コマに未消化枠がある
  （`fn_schedule_shortfall`の`shortfall` > 未回答の自由予約リクエスト件数）
- 振替候補提案（フローB）は、対象セッションを直前にキャンセル（`cancel_session`）した
  タイミングでのみ提案できる（キャンセル後に別途候補だけを追加することはできない）

## フローA: 個別予約リクエスト（自由予約）

1. 生徒がカレンダー画面で未消化枠のあるコマを選び、開始24時間以上先の日時を指定して
   リクエストを送る（アクション: `createSessionBookingRequest`）
2. コーチの「保留中パネル」「申請一覧」にpending表示される
3. コーチが応答する
   - 3a. 承認（アクション: `approveSessionBookingRequest`）→ `com_t_session`に新規行が
     作成され、生徒へ`SESSION_BOOKING_APPROVED`通知
   - 3b. 却下（理由は任意、アクション: `rejectSessionBookingRequest`）→ 生徒へ
     `SESSION_BOOKING_REJECTED`通知
   - 3c. 生徒が応答を待たずに取り下げ（アクション: `withdrawSessionBookingRequest`）
     → コーチ側の一覧から消える。以後コーチは応答できない

## フローB: 振替候補提案（キャンセル起因）

1. 生徒またはコーチが既存セッションをキャンセルする際、代替候補を最大3件、
   開始24時間以上先の日時で同時に提案できる（`cancelSession`の候補提案オプション）
2. 提案者と逆側の当事者に候補が表示される。回答期限は提案から24時間
3. 相手が応答する
   - 3a. いずれか1件を承諾（アクション: `acceptRescheduleProposal`）→ 新規セッション作成、
     同一キャンセルに紐づく他の未回答候補は自動的に不採用（status=declined）になる
   - 3b. 候補をまとめて却下（アクション: `declineRescheduleProposals`）→ 通知は送られない仕様
   - 3c. 24時間以内に応答しない → 以後の操作時にexpired扱いとなり承諾・却下ともできなくなる
     （バッチ処理ではなく、次に`acceptRescheduleProposal`等が呼ばれた時点で遅延判定される）

## 異常系・バリデーション一覧

発生層の凡例は[README.md](../../README.md)参照。「RPC（UI導線なし）」は、そのアプリのUI上に
到達手段が無く、Playwright等の画面操作では再現できず、RPC直叩き（データ主体テスト）でのみ
検証できることを示す。

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 開始24時間未満の日時で予約リクエスト/振替候補を作成しようとする | エラーで作成不可 | 両方（UI: 参考表示のメッセージのみで送信は止めない／RPC: 最終検証） |
| 2 | 提案先の日時にコーチまたは生徒の既存`scheduled`セッションと重複する | エラーで作成不可（重複相手を明示） | 両方（UI: インライン事前チェック／RPC: 最終検証） |
| 3 | 振替候補を4件以上指定する | エラー（最大3件） | 両方（UI: 4件目の追加ボタンが出ない／RPC: 最終検証） |
| 4 | 対象コマの未消化枠が0（他のpending分で使い切り済み） | 個別予約リクエストの作成不可 | RPC |
| 5 | 期限切れ(expired)の振替候補を承諾/却下しようとする | エラー。裏でstatusがexpiredへ更新される | RPC |
| 6 | 既にaccepted/declined/withdrawnの提案に再度応答しようとする | エラー（pendingのみ操作可） | RPC |
| 7 | 提案の当事者ではない生徒/コーチが承認・却下・取り下げを行おうとする | 権限エラー（本人またはアドミンのみ可） | RPC |
| 8 | 振替候補（`source_session_id`あり）に対してwithdrawを行おうとする | エラー（振替候補は取り下げ非対応。自由予約リクエストのみ可） | RPC（UI導線なし。振替候補にwithdrawボタン自体が無い） |
| 9 | コーチが個別予約リクエストを新規作成しようとする（コーチからの提案経路は無い） | DB制約で拒否（`chk_slot_proposal_booking_role`） | RPC（UI導線なし。コーチ側アプリに該当画面が無い） |

## 関連RPC・テーブル

- RPC: `create_session_booking_request`, `approve_slot_proposal`, `reject_slot_proposal`,
  `withdraw_session_booking_request`, `cancel_session`, `check_session_conflict`
- テーブル: `com_t_session_slot_proposal`, `com_t_session`, `com_m_lesson_schedule`
- 実装参照: `packages/lib/session/actions/sessionActions.ts`,
  `apps/student/actions/sessionAction.ts`, `apps/coach/actions/sessionAction.ts`
- 用語（status値・24時間ルール等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 個別予約_正常承認 | 生徒がリクエスト送信→コーチが承認→双方の画面にセッションが反映される |
| 高 | 個別予約_却下 | コーチが理由付きで却下→生徒側に却下理由が表示される |
| 中 | 個別予約_取り下げ | 生徒がpending中に取り下げ→コーチ側の一覧から消える |
| 高 | 振替候補_承諾で他候補が自動不採用 | キャンセル+候補3件提案→相手が1件承諾→残り2件がdeclined表示になる |
| 中 | 振替候補_まとめて却下 | 相手が候補をまとめて却下→提案者側の表示が更新される |
| 中 | 24時間ルール違反 | 開始24時間未満の日時を選択→送信前にUI側でエラー表示される |
| 中 | ダブルブッキング防止 | 既存予定と重複する日時を指定→エラー表示される |
| 低 | 振替候補_期限切れ | 24時間経過後に承諾操作→エラーになる（時刻操作が必要なため優先度低） |
