# お知らせ編集（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/notice/[id]/edit`
- 対象ロール: システム管理者
- 目的: 既存の「お知らせ」の内容を編集する。新規作成画面（`/notice/new`）と全く同じ入力フォーム
  （`NoticeEditor`）を使用しており、画面の構成・項目・挙動は
  [お知らせ新規作成](./new.md) と共通。本ドキュメントでは編集画面固有の差分のみを記載する。

## この画面に来る経路

- お知らせ管理一覧（`/notice`）の対象行のタイトルリンク、または編集アイコンから遷移する。

## 新規作成画面との差分

- トップバーの見出しが「お知らせの編集」になり、その下に対象のお知らせID（`notice_id`）が
  表示される。
- 各入力項目にはDBに保存されている既存値が初期値として入る（公開開始日・終了日はUTC保存値を
  JSTの日付に変換して表示）。
- 添付ファイル欄には既存の添付ファイルが表示され、新規追加分には「新規」バッジが付く。既存ファイルを
  削除した場合は保存時にStorageから物理削除される。
- 保存ボタンの文言は「更新を保存する」になる。保存に成功すると一覧画面（`/notice`）へ遷移する点は
  新規作成と同じ。
- 対象のお知らせIDが存在しない場合は404（Not Found）になる。データの読み込み自体に失敗した場合は
  「お知らせデータの読み込みに失敗しました。」という専用のエラー画面が表示される。

その他の表示要素・操作・状態については [お知らせ新規作成](./new.md) を参照。

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/notice/[id]/edit/page.tsx`
- `apps/admin/app/(app)/notice/_components/NoticeEditor.tsx`（新規作成・編集共通コンポーネント）
- `apps/admin/actions/adminNoticeAction.ts`（`getNoticeById`, `updateNotice`, `uploadNoticeFile`,
  `deleteNoticeFile`, `utcToJstInputStr`）
