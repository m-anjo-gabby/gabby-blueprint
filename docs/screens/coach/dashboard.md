# ダッシュボード画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/dashboard`
- 対象ロール: コーチ
- 目的: ログイン直後に開くホーム画面。未対応のリクエスト・未読メッセージ・お知らせ／通知の件数と、
  直近24時間のセッション、対応が必要なセッションタスクを一覧できる。

## この画面に来る経路

- コーチアプリのルートパス（`/`）は常にこの画面へリダイレクトされる（実質的なログイン後の
  最初の画面）。
- サイドバーの「Dashboard」リンク、ヘッダー左上のロゴから遷移する。

## 画面の構成

1. **ヘッダー** — 挨拶文（"Good morning/afternoon/evening, <名前>"、コーチのタイムゾーンの
   時刻帯で判定）と、コーチのタイムゾーンでの本日の日付
2. **Attentionタイル（3枚）** — Requests／Unread Messages／Updatesの件数タイル。クリックで
   それぞれの画面へ遷移する
3. **Sessionsセクション** — 「Next 24 Hours」パネルと「Session Tasks」パネルを横並びに表示

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| Requestsタイル | 件数は保留中の受信リクエスト（固定枠マッチング申請・新規予約リクエスト・振替候補提案の合計） | クリックで`/calendar`へ遷移 |
| Unread Messagesタイル | 件数は全チャットルームの未読合計 | クリックで`/chat`へ遷移 |
| Updatesタイル | 件数はお知らせ未読数＋通知未読数の合計 | クリックで`/notification`へ遷移 |
| 「Next 24 Hours」内のセッション行 | 実施予定（scheduled）のセッションのうち、今から24時間以内に開始または実施中のものを開始時刻順に表示（暦日ではなく「今から24時間」のローリングウィンドウで絞り込むため、日付が変わる直前の時間帯でも見え方が狭くならない） | クリックで該当生徒のセッション詳細（`/students/[id]/sessions/[sessionId]`）へ遷移。最も近い1件には「Up next」ラベルが付く |
| 「View calendar」リンク | 常時表示 | `/calendar`へ遷移 |
| Session Tasksの「… — End Session needed」行 | 終了予定時刻を過ぎてもまだ結果が確定していない（scheduledのままの）セッションがある場合 | クリックでそのセッションの詳細画面へ遷移し、そこで終了処理を行う |
| Session Tasksの「… — Homework not posted」行 | 結果確定済み（completed）だが宿題が未投稿のセッションがある場合 | クリックでセッション結果画面（`/students/[id]/sessions/[sessionId]/result`）へ遷移 |
| Session Tasksの「… — Makeup session available」行 | 担当する生徒の定期コマで、本来の実施回数に対して実際の予定回数が不足している（未消化枠がある）場合 | クリックで生徒概要（`/students/[id]`）へ遷移 |
| Session Tasksの件数バッジ「N open」 | 上記3種のタスク合計が1件以上の場合のみ表示 | — |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| Next 24 Hours 読み込み中 | スケルトン（グレーのプレースホルダー）2件分 | セッション取得中 |
| Next 24 Hours 空 | 「No sessions in the next 24 hours」 | 該当ウィンドウ内に実施予定のセッションが無い場合 |
| Session Tasks 空 | 「You're all caught up」 | 3種のタスクがいずれも0件の場合 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/dashboard/page.tsx`
- `apps/coach/app/(app)/dashboard/_components/DashboardHeader.tsx`
- `apps/coach/app/(app)/dashboard/_components/AttentionStrip.tsx`
- `apps/coach/app/(app)/dashboard/_components/TodaysSessionsPanel.tsx`
- `apps/coach/app/(app)/dashboard/_components/SessionTasksPanel.tsx`
- サーバーアクション: `getMyProfile`, `getPendingIncomingRequestsForCoach`, `getMySessions`,
  `getMySessionTasks`（`apps/coach/actions/coachProfileAction.ts`,
  `apps/coach/actions/matchingRequestAction.ts`, `apps/coach/actions/sessionAction.ts`）
