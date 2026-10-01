# チャットルーム一覧画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/chat`
- 対象ロール: コーチ
- 目的: 自分が参加しているチャットルーム（生徒との1対1、または複数人のグループ）を一覧し、
  未読状況を確認して該当ルームを開く。
- チャットは2ペイン表示。`md` 以上では左にルーム一覧、右に選択中のルーム（[room.md](room.md)）を
  並べる。`md` 未満では一覧だけを表示し、ルームを選ぶとルーム画面に切り替わる。

## この画面に来る経路

- サイドバーの「Chat」リンクから遷移する（未読合計件数がバッジ表示される）。
- ダッシュボードの「Unread Messages」タイルから遷移する。

## 画面の構成

1. **左ペイン（ルーム一覧）**
   1. 見出し「Chat」
   2. 検索欄 — 「Search by name or message」
   3. 絞り込み — 「All」「Unread」の切り替え
   4. ルーム一覧 — 1対1／グループの別、相手の名前、直近メッセージのプレビュー、日時、未読件数バッジ
2. **右ペイン（`md` 以上）** — ルーム未選択時は「Select a conversation」の案内。ルームを選ぶと
   チャット詳細（[room.md](room.md)）を表示する

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 検索欄 | 常時表示 | ルーム名・参加者名・最新メッセージの本文に部分一致で絞り込む（大文字小文字を区別しない）。×ボタンで入力をクリア |
| 「All」「Unread」 | 常時表示。「Unread」には未読のあるルーム数を赤いバッジで表示 | 「Unread」を選ぶと未読メッセージのあるルームだけを表示する（開いているルームは既読になっても表示し続ける） |
| ルーム行のアイコン | 1対1はアイコン画像（未設定時は人型アイコン）、グループは常に人々アイコン | — |
| 種別ラベル | 1対1の場合は相手の種別（"Student"/"Admin"）、グループの場合は「Group」 | — |
| 直近メッセージのプレビュー | 削除済みメッセージは「This message was deleted」、写真のみは「📷 Photo」、ファイルのみは「📎 File」、メッセージが1件も無い場合は「No messages yet」 | — |
| 未読件数バッジ | そのルームの未読件数が1件以上の場合のみ表示（99件を超えると「99+」）。未読のある行は名前を太字で表示 | — |
| ルーム行のクリック | 常時。開いているルームの行は淡い青で強調する | `/chat/[roomId]` を開く（`md` 以上は右ペインに表示） |
| 一覧のリアルタイム更新 | この画面を開いている間、参加中のルームに新着メッセージが届いた場合 | そのルームを一覧の先頭へ移動し、プレビュー・時刻を更新する。開いていないルームは未読件数を1増やす |
| サイドバーの未読バッジ | チャット画面以外を開いている間も、新着メッセージが届くとリアルタイムに増える | — |
| キーボード操作 | 常時 | Alt + ↑／↓ で、表示中の一覧の前後のルームを開く |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| ルームが1件も無い | 「No chat rooms yet」「An admin will create a chat room for you to start a conversation.」 | 参加しているルームが1件も無い場合 |
| 検索・絞り込みで0件 | 「No matching chat rooms」 | 検索語・「Unread」の絞り込みの結果、該当ルームが無い場合 |
| ルーム未選択（右ペイン） | 「Select a conversation」「Choose a chat room from the list to read and reply to messages.」 | `md` 以上で `/chat` を開いている場合 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/chat/layout.tsx`, `apps/coach/app/(app)/chat/page.tsx`
- `apps/coach/app/(app)/chat/_components/CoachChatLayout.tsx`（生徒の所属顧客はコーチに見せないため、顧客での絞り込みは置かない）
- `apps/coach/constants/chat.ts`（文言 `CHAT_LABELS`、2ペインにする画面幅 `CHAT_SPLIT_BREAKPOINT`）
- 共通部品: `packages/lib/components/chat/ChatSplitLayout.tsx`, `ChatRoomListPane.tsx`
- ストア: `@gabby/lib/stores/useChatStore`（ルーム一覧・未読数の取得元）、
  一覧のRealtime購読: `@gabby/lib/chat/realtime/useChatRoomsRealtime`
