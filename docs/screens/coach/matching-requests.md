# 申請一覧画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/matching-requests`
- 対象ロール: コーチ
- 目的: 生徒からの3種類のリクエスト（固定枠マッチング申請・新規予約リクエスト・振替候補提案）を
  保留中／履歴の両方でまとめて確認し、保留中のものはその場で承認・却下できる。

## この画面に来る経路

- カレンダー画面のPending Requestsパネルにある「History」リンクから遷移する（独立したサイド
  バー項目としては存在しない）。
- 画面上部の「Back to Calendar」リンクでカレンダー画面へ戻れる。

## 画面の構成

1. **ヘッダー** — 画面タイトルと説明文、カレンダーへ戻るリンク
2. **Pendingセクション** — 保留中の3種類のリクエストをまとめて一覧表示（カレンダー画面の
   Pending Requestsパネルと同じカードコンポーネントを使用。日付ホバーによるハイライトは無い）
3. **Historyセクション** — 「Matching Requests」「Bookings」「Reschedule Proposals」の3タブに
   分かれた履歴一覧。タブ切り替えでは読み込み済みページは保持され、下にスクロールすると
   追加のページを読み込む

## リクエストの3種類

| 種類 | カード上のラベル | 内容 |
|---|---|---|
| 固定枠マッチング申請 | "Matching Request" | 生徒が「毎週◯曜日◯時〜◯時」の固定コマでこのコーチとのマッチングを申請したもの。承認すると、残りのライセンス期間分のセッションが一括で自動生成される |
| 新規予約リクエスト | "New Booking" | 生徒が既存コマの未消化枠を使い、自由な日時で単発セッションを申請したもの |
| 振替候補提案 | "Reschedule Proposal" | 既存セッションのキャンセルに伴い、生徒（またはコーチ）が代替候補日時を最大3件まとめて提案したもの |

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 固定枠マッチング申請カードの表示内容 | 生徒名、コマ番号（Slot n）、希望曜日・時間帯、申請日、直近24時間以上先で最初に発生する開催日（"First session"、pending中のみ計算表示） | — |
| 固定枠マッチング申請の「Approve」ボタン | statusがpendingの場合のみ | 確認ダイアログ（「毎週◯曜日◯時〜◯時、残りのライセンス期間分すべてを予約する」旨の説明）の上で承認。承認すると定期コマが作成され、期間分のセッションが一括生成される |
| 固定枠マッチング申請の「Reject」ボタン | statusがpendingの場合のみ | 却下理由の入力ダイアログを開く。理由は必須で、生徒に表示される |
| 新規予約リクエストカードの表示内容 | 生徒名、希望日時、申請日、生徒が入力した理由（あれば） | — |
| 新規予約リクエストの「Approve」ボタン | statusがpendingの場合のみ | 確認ダイアログの上で承認。承認すると`com_t_session`に新規セッションが1件作成される |
| 新規予約リクエストの「Reject」ボタン | statusがpendingの場合のみ | 却下理由の入力ダイアログを開く（理由は任意） |
| 振替候補提案カードの表示内容 | 生徒名、元セッションの開催予定日時、pending中の候補日時一覧 | — |
| 振替候補提案の「Book this time」ボタン | 候補ごとに表示（pendingの候補のみ） | その候補で新規セッションが作成され、同じキャンセルに紐づく他の未回答候補は自動的に「Declined」表示に変わる |
| 振替候補提案の「Decline all」ボタン | pendingの候補が1件以上ある場合 | 残っている候補をまとめて却下する。生徒への通知は送られない仕様 |
| Historyタブ切り替え（Matching Requests / Bookings / Reschedule Proposals） | 常時表示 | 該当する種類の履歴一覧に切り替える。カード自体はPendingと同じ見た目だが、statusがpendingでないためApprove/Rejectボタンは表示されない |
| Historyの各カード | 承認済み・却下済み・取り下げ済み等、確定した過去のリクエスト | ステータスバッジと（却下時は）却下理由が表示される。それ以上の操作はできない |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| Pendingが空 | 「No pending requests.」 | 保留中のリクエストが1件も無い場合 |
| Historyの各タブが空 | 「No matching request history yet.」/「No booking request history yet.」/「No reschedule proposal history yet.」 | そのタブの履歴が1件も無い場合 |
| Pendingでの承認・却下 | 対象カードの表示がその場で更新され、一覧から消える（Pendingから外れる） | Approve/Reject/Book this time/Decline allのいずれかを実行した場合。サイドバーのリクエスト件数バッジも合わせて再取得される |

## 関連する業務フロー仕様書

- [個別予約リクエスト・振替候補フロー](../../../testing/e2e/specs/booking/individual-booking-and-reschedule.md)
  — 本画面の「New Booking」「Reschedule Proposal」の承認・却下・取り下げが生徒側の操作と
  どう連動するか、異常系の一覧。なお同仕様書は固定枠マッチング申請（"Matching Request"）の
  フローは対象外としている（別ドメインの初回マッチング機能であり、現時点で対応する業務フロー
  仕様書は作成されていない）

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/matching-requests/page.tsx`
- `apps/coach/app/(app)/matching-requests/_components/MatchingRequestsView.tsx`
- `apps/coach/app/(app)/matching-requests/_components/RequestHistoryTabs.tsx`
- `apps/coach/components/requests/MatchingRequestCard.tsx`
- `apps/coach/components/requests/BookingRequestCard.tsx`
- `apps/coach/components/requests/RescheduleProposalRequestCard.tsx`
- `apps/coach/components/requests/RequestKindTag.tsx`
- `apps/coach/hooks/useCoachPendingRequests.ts`
- `apps/coach/actions/matchingRequestAction.ts`, `apps/coach/actions/sessionAction.ts`
- 関連RPC: `approve_matching_request`, `reject_matching_request`, `approve_slot_proposal`
  （新規予約リクエストの承認・振替候補の承諾の両方で共通利用）, `reject_slot_proposal`
  （新規予約リクエストの却下・振替候補のまとめ却下の両方で共通利用）
