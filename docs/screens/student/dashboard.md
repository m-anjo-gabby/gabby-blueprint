# ダッシュボード（studentアプリ）

## 概要

- アプリ: `student`
- パス: `/dashboard`
- 対象ロール: 生徒
- 目的: ログイン後の起点となる画面。各機能への導線、次回セッションの確認、学習再開（ブックマーク）
  の提示を行う。

## この画面に来る経路

- ログイン後に遷移する（アプリの実質的なホーム画面）。
- 画面上部のヘッダーロゴ、または他画面の「戻る」導線から遷移してくる。

## 画面の構成

1. **ヒーローエリア** — アプリ名のロゴ表示のみ（操作要素なし）
2. **クイックナビゲーション（グリッド）** — 各機能への導線ボタン
3. **次回セッションカード** — 直近のライブセッションがある場合のみ表示
4. **Analytics & Insights セクション** — トレーニングパフォーマンス確認、モニター専用画面への導線
5. **Continue Learning セクション** — 学習再開カード、またはブックマークが無い旨の表示

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| Library ボタン | 常時表示 | `/library`（教材一覧）へ遷移 |
| Favorites ボタン | 常時表示 | `/favorites`（お気に入り）へ遷移 |
| Live Session ボタン | ライブセッション付き契約の有効なチケットを1件以上保持している場合のみ表示 | `/live-room`（ライブセッションハブ）へ遷移 |
| Calendar ボタン | 同上 | `/calendar`へ遷移 |
| Coaching ボタン | 同上 | `/coach-matching`（専属コーチを探す）へ遷移 |
| Chat ボタン | 同上 | `/chat`（チャット一覧）へ遷移 |
| 次回セッションカード | ライブセッション付き契約を保持し、かつ直近の予定セッションが存在する場合のみ表示。コーチ名・開始日時を表示 | タップすると、開始48時間以内なら該当セッションのライブルームへ、それ以外は `/live-room` へ遷移 |
| 「現在のパフォーマンスを確認」ボタン | 常時表示 | `/training/performance` へ遷移 |
| 「モニターダッシュボード」ボタン | ログインユーザーが`monitor`ロールを持つ場合のみ表示 | `/monitor` へ遷移 |
| Continue Learning カード | 学習途中（ブックマーク）の教材がある場合に表示。教材名・種別・CEFRバッジ・進捗率・進捗バーを表示 | カードをタップすると、続きの教材ページへ遷移。カード右上のゴミ箱アイコンで削除できる（確認ダイアログあり） |
| Continue Learning が空の場合の表示 | ブックマークが無い場合 | 「ブックマークした教材がありません」という案内を表示するのみ（操作なし） |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| Continue Learning 読み込み中 | スケルトン（グレーのプレースホルダー）を表示 | 学習再開データの取得中 |
| Continue Learning 空 | 「ブックマークした教材がありません／教材を選択して学習を開始しましょう」 | 学習途中の教材（ブックマーク）が無い場合 |
| ブックマーク削除確認 | 「ブックマークを削除？」の確認ダイアログ | Continue Learning カードの削除アイコンをタップした時 |

## 実装参照（エンジニア向け）

- `apps/student/app/(app)/(main)/dashboard/page.tsx`
- `apps/student/app/(app)/(main)/dashboard/_components/DashboardHero.tsx`
- `apps/student/app/(app)/(main)/dashboard/_components/NavigationGrid.tsx`
- `apps/student/app/(app)/(main)/dashboard/_components/NextSessionCard.tsx`
- `apps/student/app/(app)/(main)/dashboard/_components/ResumeCard.tsx`
- `apps/student/app/(app)/(main)/dashboard/_components/DashboardEmptyState.tsx`
- 関連アクション: `getMyLiveSessionTickets`, `getMyUpcomingSessions`, `toggleContentFavorite`
- 備考: 「Picked for You」（おすすめ教材）セクションはコード上に実装されているが、
  `SHOW_EXPERIMENTAL_FEATURES`フラグが`false`のため現在は非表示。
