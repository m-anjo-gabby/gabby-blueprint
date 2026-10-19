# 通知（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/notification`
- 対象ロール: 管理者
- 目的: システムから届いた自分宛の通知（`com_t_notification`）を一覧確認する。

## この画面に来る経路

- ヘッダー等の通知アイコンから遷移する（画面を開くたびに最新の通知一覧を取得し直す）。

## 画面の構成

1. **ヘッダー** — 画面タイトル、説明文、通知件数バッジ
2. **通知一覧** — カード形式で新しい順に表示

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 通知件数バッジ | 常時表示 | 現在表示中の通知件数を表示 |
| 通知カード | 通知ごとに1枚。未読は左のドットが濃い色・太字タイトルで強調表示 | クリックすると、未読の場合は既読にした上で、通知に紐づくリンク（`link_path`）があればその画面へ遷移する。リンクが無い通知はその場で既読になるのみ |
| カード内の日時 | 通知発生日時（管理者のタイムゾーン基準） | 表示のみ |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 読み込み中 | 見出しは本物のまま、件数バッジの数字と一覧（カード形の骨組み4件）だけを骨組みで表示する。取り直しが終わったら、その場で一覧に置き換える（フェードインはしない） | 画面への遷移中（`loading.tsx`）と、画面を開いてからの取り直しが終わるまで（ストアに残っていた古い一覧や、取得前の「0件」は出さない） |
| 通知なし | 「現在通知はありません」 | 通知が1件も無い場合 |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/notification/page.tsx`（`useFetchOnMount` で開くたびに取り直す）, `loading.tsx`
- `apps/admin/app/(app)/notification/_components/NotificationCard.tsx`
- `apps/admin/app/(app)/notification/_components/NotificationPageParts.tsx`（見出し・件数バッジ・一覧の骨組み。画面と `loading.tsx` で共有）
- ヘッダーの通知ベルの件数は、レイアウトでサーバー取得して流し込む（`apps/admin/lib/shellData.ts`・`components/common/ShellDataLoader.tsx`・`packages/lib/shell/loadCommonShellData.ts`。サイドバーのチャット未読も同じ）
- 状態管理: `packages/lib/stores/useNotificationStore.ts`（`fetchNotifications`, `markAsRead`。
  student/coach/adminの3アプリで共通利用）
- 通知種別・表示テキストの定義: `packages/types/notification.ts`
  （`NOTIFICATION_TYPES`, `NOTIFICATION_MESSAGE_BUILDERS`。どの種別が実際に届くかは、各業務機能側の
  通知発行処理に依存する）。表示時は `packages/lib/notification/display.ts` の `getNotificationDisplay`
  （アイコン・バッジ色・文言。知らない種別は汎用の文言）を使う（student/coach/admin 共通）
- 管理者宛ての通知: Webトライアルの申込（`TRIAL_APPLIED`。申込のたびに管理者全員へ。押すと [trial-applications.md](trial-applications.md) へ移る）。
  管理者宛ての通知はメールを送らない
