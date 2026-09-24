# 通知一覧画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/notification`
- 対象ロール: コーチ
- 目的: 自分宛に発生したシステムイベント（チャット新着、セッションの予約・キャンセル・振替候補、
  マッチング、月次レポート承認等）の通知を確認し、関連する画面へ遷移する。

## この画面に来る経路

- ヘッダー右上の通知ベル（Notification Center）の「Notifications」タブから「View all →」で
  遷移する。

## 画面の構成

1. **ヘッダー** — 画面タイトル、説明文、件数バッジ
2. **通知一覧** — アイコン・タイトル・本文・発生日時のカードを縦に並べる

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 未読インジケーター（青丸） | 未読の通知 | クリックすると既読になる |
| アイコン | 通知種別ごとのアイコン・色（例: チャットは吹き出しアイコン） | — |
| タイトル・本文 | 通知種別ごとに定型文で組み立てられる（下表参照） | — |
| カードのクリック | 常時 | 未読の場合は既読にした上で、通知に紐づく画面（`link_path`）があればそこへ遷移する |

### 通知の種類（コーチ向けに実際に文言が用意されているもの）

| 種別 | タイトル・本文の例 |
|---|---|
| チャット新着（CHAT_NEW_MESSAGE） | タイトル＝送信者名、本文＝メッセージのプレビュー |
| セッションキャンセル（コーチ自身によるもの） | 「Session cancelled」／「You cancelled a scheduled session.」 |
| セッションキャンセル（生徒によるもの） | 「Session cancelled」／「<生徒名> cancelled a scheduled session.」 |
| セッションキャンセル（運営によるもの） | 「Session cancelled」／「A scheduled session was cancelled. Check your calendar for details.」 |
| セッション内容変更（運営によるもの） | 「Session updated」／「An administrator updated a scheduled session. Check your calendar for details.」 |
| 振替候補を提案した（コーチ発） | 「Reschedule proposal sent」／「Your proposed reschedule times were sent to the student.」 |
| 振替候補を提案された（生徒発） | 「Reschedule candidates received」／「<生徒名> proposed N candidate time(s) for a cancelled session. Check the requests page.」 |
| 新規予約リクエストを受信 | 「Booking request received」／「<生徒名> requested a new session booking. Check the requests page.」 |
| 新規セッションが予約された | 「New session booked」／「<生徒名> booked or rescheduled a session.」 |
| 新規生徒とマッチングされた | 「You've been matched with a new student」／「Live sessions with <生徒名> are now scheduled.」 |
| 月次レポートが承認された | 「Monthly report approved」／「Your monthly coaching report for <対象月> was approved.」 |
| 月次レポートの承認が取り消された | 「Monthly report approval revoked」／「Approval for your <対象月> monthly coaching report was revoked.」 |

上記以外にも通知種別の定義自体は用意されているが（トレーニング開始・連続記録、マッチング承認/
却下、宿題投稿等）、実装コメント上「生徒宛にのみ送られる」とされておりコーチが受け取ることは
想定されていない。

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 読み込み中 | スケルトン4件分 | 画面表示直後、データ取得中（この画面では常に最新データを再取得する） |
| 空 | 「No notifications yet」「You'll see training and messaging activity here.」 | 通知が1件も無い場合 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/notification/page.tsx`
- `apps/coach/app/(app)/notification/_components/NotificationCard.tsx`
- `apps/coach/constants/notification.ts`（通知種別ごとの英語タイトル・本文の組み立てロジック）
- ストア: `@gabby/lib/stores/useNotificationStore`
