# カレンダーイベント参加者・アナウンス管理（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/calendar-events/[id]/participants`
- 対象ロール: システム管理者
- 目的: 特定のカレンダーイベント（グループセッション・メンテナンス告知等）について、参加登録
  （RSVP）済みの生徒/コーチを確認し、参加者・担当コーチへ一方向のアナウンス（お知らせ）を配信する。

## この画面に来る経路

- カレンダーイベント管理一覧（[list.md](./list.md)）で、参加確認が有効、または担当コーチが
  1人以上割り当てられている行の参加者・アナウンス管理アイコン（人型アイコン）から遷移する。

## 画面の構成

1. **ヘッダー** — 一覧へ戻るリンク、対象イベントのタイトル
2. **タブ切り替え** — 「参加者一覧」「アナウンス」の2タブ

## 参加者一覧タブ

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 参加人数カード | 常時表示 | 参加登録済みの人数を表示（表示のみ） |
| 検索ボックス | 常時表示 | 氏名の部分一致で一覧を絞り込む |
| 参加者テーブル | 氏名、種別（生徒/コーチ等）、参加登録日時 | 表示のみ |

このタブは「参加した人だけ」の一覧であり、配信対象母集団（生徒全体/顧客指定/コーチ全体）との
突合（誰が未参加か）は行わない点に注意。

## アナウンスタブ

- 過去に配信したアナウンスを新しい順にカード形式で一覧表示する（タイトル・本文・添付ファイル・
  配信日時、編集済みの場合は「編集済み」バッジと更新日時を表示）。
- **「アナウンスを送信」ボタン**でダイアログを開き、タイトル（必須）・本文（必須）・添付ファイル
  （任意、複数可）を入力して送信する。送信すると、このイベントの参加者・担当コーチに配信される
  （返信・既読管理はない一方向のメッセージ）。
- 各アナウンスの編集アイコンから、同じダイアログで内容を編集できる（編集すると一覧上に
  「編集済み」バッジが付く）。
- 各アナウンスの削除アイコンから、確認ダイアログを経て削除できる（誤送信時の取り消し用。
  削除後は生徒/コーチのカレンダーからも表示されなくなる旨が案内される。添付ファイルもStorageから
  物理削除される）。
- 添付ファイルはクリックすると参照用URLを取得して新しいタブで開く（ダウンロード）。

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 対象イベントが存在しない | 「カレンダーイベントが見つかりません。」 | 指定したcalendar_event_idが存在しない場合 |
| 参加者が0件 | 「参加者がまだいません。」 | RSVP参加登録者が1人もいない場合 |
| アナウンスが0件 | 「アナウンスはまだありません」 | このイベント宛のアナウンス配信履歴が無い場合 |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/calendar-events/[id]/participants/page.tsx`
- `apps/admin/app/(app)/calendar-events/[id]/participants/_components/CalendarEventParticipantsTable.tsx`
- `apps/admin/app/(app)/calendar-events/[id]/participants/_components/CalendarEventAnnouncementPanel.tsx`
- `apps/admin/actions/adminCalendarEventAction.ts`
  （`getCalendarEventParticipants`, `getCalendarEventMessages`, `createCalendarEventMessage`,
  `updateCalendarEventMessage`, `deleteCalendarEventMessage`, `uploadCalendarEventMessageFile`,
  `deleteCalendarEventMessageFile`, `getCalendarEventMessageAttachmentUrl`。いずれもRPCではなく
  `com_t_calendar_event_participant` / `com_t_calendar_event_message`への直接CRUD）
- `packages/types/calendarEvent.ts`（`CalendarEventMessageItem`, `CalendarEventMessageAttachment`の正本）
