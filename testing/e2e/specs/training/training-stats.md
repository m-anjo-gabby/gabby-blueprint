# トレーニング実績の集計（実施日数・連続日数・通算値・月次）

## 概要

生徒の自主トレーニング（単語帳・スプリントのドリルモード・スプリントのセッションモード）の実績を、
日次の記録から「実施日数・連続日数・通算値・月次の集計」にまとめ、ホーム・トレーニング記録・各履歴・
達成の通知・モニター・トレーニングレポートに表示する。実績は**生徒が選んでいるタイムゾーンでの実施日**で数える
（例: 日本時間 10/1 8:00 に実施すれば10/1の実績）。日時はDBにUTCで保存し、日次の記録（単語帳・ドリル）は
タイムゾーンを変えられるため、記録した時点のタイムゾーンでの日付で確定させる（トレーニングレポートの期間の境界だけは日本時間）。

## 関与ロール・画面

| ロール | 画面 | パス | 使う集計 |
|---|---|---|---|
| 生徒 | ホーム（今週のトレーニング・これまでの歩み） | `student` `/dashboard` | 月次の記録（今週分）、通算値（`student_m_training_lifetime_stats`）。画面仕様: [dashboard.md](../../../../docs/screens/student/dashboard.md) |
| 生徒 | トレーニング記録 | `student` `/training/performance` | 月次の記録（`get_user_training_performance`）。画面仕様: [performance.md](../../../../docs/screens/student/training/performance.md) |
| 生徒 | 単語帳の履歴・スプリントの履歴 | `student` `/training/word/history`, `/training/sprint/history` | 月次の記録（`getUserWordHistoryAction`・`getUserSprintHistoryAction`）。画面仕様: [word-history.md](../../../../docs/screens/student/training/word-history.md)、[sprint-history.md](../../../../docs/screens/student/training/sprint-history.md) |
| 生徒 | 通知センター | `student` ヘッダーのベル | 達成の通知（`notify_training_milestone`）。画面仕様: [notification.md](../../../../docs/screens/student/notification.md) |
| 生徒（モニター） | モニター | `student` `/monitor` | 日次の記録（対象生徒・期間で絞る）。仕様: [monitoring/student-monitor-dashboard.md](../monitoring/student-monitor-dashboard.md) |
| アドミン | トレーニングレポート | `admin` `/training-reports` | 日次の記録（ライセンス期間で絞る。`get_training_report_data`） |

## 前提条件

- 記録が作られるのは生徒の操作だけ（音声の入出力が必要）。E2Eで記録の反映を確かめるには、日次の記録・通算値を
  DBに直接作るか、利用者ペルソナ（[FIXTURES.md](../../../FIXTURES.md)「利用者ペルソナ」。学習履歴は投入日の前日まで）を使う。
- 通算値・連続日数は記録を作る経路（下記フロー1）でしか更新されない。日次の記録だけをDBに直接入れても通算値は変わらないため、
  両方を確かめるテストは `student_m_training_lifetime_stats` も合わせて作る。
- 業務ロジックのRPC（`increment_word_summary` 等）は `auth.uid()` を使うため、データ主体テストでは生徒本人のJWTで呼ぶ（CLAUDE.md 6章）。

## フロー（正常系）

1. 生徒がトレーニングすると、日次の記録が作られる。日付は記録した時点の、生徒のタイムゾーン（`com_m_user.timezone`、未設定は `Asia/Tokyo`）での日付。
   - 1a. 単語帳: 進捗を5分ごと・画面を離れる時・ブックマーク時に `increment_word_summary` で送り、`self_t_word_summary`（生徒×教材×日付）に単語数・フレーズ数・発話評価数を加算する。
   - 1b. スプリントのドリルモード: `increment_sprint_summary` で `self_t_sprint_summary`（生徒×教材×日付）に問題数・発話評価数・種別ごとの問題数を加算する。
   - 1c. スプリントのセッションモード（制限時間あり）: 完了・タイムアップで `self_t_sprint` に1回分を1行で保存する（`insert_date` は日時）。
2. 1a〜1cのそれぞれで、通算値（`student_m_training_lifetime_stats`）を `update_training_lifetime_stats` で更新する（1cは `self_t_sprint` の INSERT トリガー `sync_sprint_session_lifetime_stats`）。
   - 実施日数（`total_active_days`）: 最終実施日（`last_training_date`）と違う日なら +1。同じ日の2回目以降は増えない。
   - 連続日数（`current_streak_days`）: 最終実施日の翌日なら +1、同じ日なら据え置き、2日以上空いていれば 1 に戻る。
   - 初回トレーニング日（`first_training_date`）は最も古い日付、最終実施日は最も新しい日付を保つ。
   - 通算の単語数・フレーズ数・発話評価数は常に加算する。通算のスプリント本数・回答数はセッションモード（1c）だけが加算する。
3. 通算値が更新されると、トリガー `notify_training_milestone` が達成を判定して通知を作る。
   - 初回トレーニング（実施日数が 0→1）: 通知「TRAINING_FIRST」。
   - 連続日数が 5 日に到達: 通知「TRAINING_STREAK」（重複防止キー `STREAK_5`）。
   - どちらも生徒ごとに1回だけ（重複防止キーで2回目以降は作らない）。
4. ホームの「今週のトレーニング」は、今週（生徒のタイムゾーンで月〜日）に1a〜1cのいずれかがある日を実施日として数える。
   連続日数は通算値を使い、最終実施日が「昨日」より前なら途切れたものとして表示しない（今日まだ実施していなくても、昨日まで続いていれば継続中）。
   2日以上続いているときだけ「n日連続」を表示する。
5. ホームの「これまでの歩み」は通算値を使う。実施日数の節目は 3・7・14・30・50・100・200・365日（以降 500→1,000…）、
   発話評価の節目は 10回から 1-2-5 の系列（20→50→100…）。今週のうちに越えた節目に「n日に到達」のバッジを付ける。
6. トレーニング記録・各履歴は、指定月の1a〜1cを集計する。
   - トレーニング日数: 1a〜1cのいずれかがある日の数。
   - 発話回数: 1a〜1cの発話評価数の合計。
   - スプリントの回数・回答数: 1cだけ（ドリルモードは含まない。画面に注記あり）。
   - 月の範囲: 1a・1bは日付（`training_date`）で、1cは実施日時を**表示時点の**生徒のタイムゾーンの日付にして絞る（`get_user_training_performance`・`getUserSprintHistoryAction`）。
     月の指定（`?month=`）が無いときは、生徒のタイムゾーンでの今月（`apps/student/lib/userTimezone.ts`）。
7. モニター・トレーニングレポートは1a〜1cの記録を対象生徒・期間で絞って集計する。期間は**日本時間**で区切る
   （集計期間のタイムゾーン。アプリ側 `packages/lib/date/reporting.ts`、DB側 `public.reporting_timezone()`。日本時間以外で区切る必要が出たらここを顧客ごとの設定に置き換える）。
   - モニター: 対象月・期間、対象生徒（ライセンス期間との重なり）は日本時間の暦日。各実績は受講生のタイムゾーンでの実施日（1cはRPCで算出）。
   - トレーニングレポートの期間は、ライセンスの開始・終了を**日本時間の日付**にした範囲（顧客との契約が日本法人のため）。
     各実績の日付は生徒のタイムゾーンでの実施日（1cは実施日時を生徒のタイムゾーンの日付にする）。スプリント問題数はドリルの問題数＋セッションの回答数。
   - 学習の記録はライセンスの有無と関係なく作られる。ライセンスの期間外の学習は、期間で絞る集計（レポート）には出ないが、通算値には含まれる。

## 異常系・境界値一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 同じ日に単語帳・ドリル・セッションを複数回実施する | 実施日数・連続日数は1日分だけ増える。通算の数・日次の記録は回数分加算される | RPC |
| 2 | 深夜（例: JSTの23:30と翌0:30）に続けて実施する | 生徒のタイムゾーンでの日付で2日に分かれ、実施日数・連続日数が2日分増える | RPC |
| 3 | 2日以上空けてから実施する | 連続日数が1に戻る。実施日数・通算値は減らない | RPC |
| 4 | 最終実施日より前の日付で更新が届く（時計のずれ等） | 実施日数・連続日数・最終実施日は変わらない。通算の数は加算する。初回トレーニング日はより古い日付に更新される | RPC（UI導線なし） |
| 5 | 最後の実施が一昨日以前で、今日ホームを開く | 「n日連続」を表示しない（DBの連続日数は次の実施まで残る） | UI |
| 6 | 連続日数が5日に2回目に到達する（途切れた後に再び5日続く） | 通知は作られない（初回の到達だけ） | RPC |
| 7 | プロフィールでタイムゾーンを変える | 以後の記録は新しいタイムゾーンの日付で作られる。過去の記録の日付は変わらない | RPC |
| 8 | スプリントのセッションモードだけを実施する | 実施日数・連続日数・通算のスプリント本数・回答数・発話評価数が増える。日次の記録（`self_t_sprint_summary`）は作られない | RPC |
| 9 | ライセンスの期間外（開始前・終了後）に学習する | 記録・通算値は作られる。トレーニングレポートの期間の集計には入らない | RPC |
| 10 | 日本時間で月初の早朝（例: 10/1 8:00 ＝ UTC 9/30 23:00）にセッションモードを実施する | トレーニング記録・スプリントの履歴で10月の実績になる（日時はUTCで保存し、表示・集計のときに生徒のタイムゾーンの日付・月にする） | RPC・UI |
| 11 | タイムゾーンがUTCより西（例: `America/New_York`）の生徒が単語帳・ドリルを実施する | トレーニング記録・各履歴で、記録した日付のまま表示される（日付だけの値 `training_date` はタイムゾーンをまたいで変換しない） | UI |
| 12 | スプリントのセッションモードだけを実施した生徒のトレーニングレポート | 学習日数・スプリント問題数（ドリルの問題数＋セッションの回答数）・発話評価にセッションの実施を含める。セッションの日付は生徒のタイムゾーンでの日付で、期間（日本時間）の内外を判定する（例: ニューヨークの生徒の 9/30 22:00 は UTC では10/1 でも 9/30 の実績） | RPC |

## 関連RPC・テーブル

- RPC: `increment_word_summary`, `increment_sprint_summary`, `get_user_training_performance`, `get_training_report_data`, `get_monitor_word_history`, `get_monitor_sprint_history`, `get_monitor_sprint_drill_history`
- 内部関数・トリガー: `update_training_lifetime_stats`（外部から実行不可）, `sync_sprint_session_lifetime_stats`（`self_t_sprint` の INSERT）, `notify_training_milestone`（`student_m_training_lifetime_stats` の更新）
- テーブル: `self_t_word_summary`, `self_t_sprint_summary`, `self_t_sprint`, `student_m_training_lifetime_stats`, `com_t_notification`
- 実装参照:
  - 記録: `apps/student/actions/wordAction.ts`（`reportWordProgress`）、`apps/student/actions/sprintAction.ts`（`reportSprintProgress`・`createSprintScoreAction`）
  - 月次: `apps/student/actions/performanceAction.ts`、`apps/student/app/(app)/(shell)/training/performance/_components/TrainingPerformance.tsx`
  - ホーム: `apps/student/app/(app)/(shell)/dashboard/_lib/weeklyActivity.ts`（今週・連続日数の表示判定）、`milestones.ts`（節目）
  - 日付の変換: `packages/lib/date/date.ts`（`toIsoDateInZone`・`formatZonedDate`。日付だけの値は変換しない）、生徒のタイムゾーン: `apps/student/lib/userTimezone.ts`
- 用語: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 通算値・連続日数の更新（データ主体テスト） | 使い捨ての生徒のJWTで `increment_word_summary`・`increment_sprint_summary` を呼び、`self_t_sprint` を作り、異常系 #1〜#4・#8 の通算値を確かめる |
| 高 | ホームの連続日数の表示 | 使い捨ての生徒に通算値（最終実施日=昨日／一昨日）を直接作り、「n日連続」の有無を確かめる（異常系 #5） |
| 高 | トレーニングレポートの集計（データ主体テスト、実装済み） | `testing/features/branches/feature-20261001-dev/training-report-sessions-verify.ts`（#12。セッションだけの日・期間の境界・西のタイムゾーン） |
| 中 | 達成の通知 | 通算値を4日連続の状態にしてから実施相当の更新をし、通知が1回だけ作られることを確かめる（#6） |
| 中 | 月の境界・タイムゾーン | 月初の日本時間早朝のセッション、西のタイムゾーンの生徒の単語帳の記録を作り、トレーニング記録・各履歴の当月に正しい日付で出ることを確かめる（#10・#11。実装済み: [tests/training/training-dates.spec.ts](../../tests/training/training-dates.spec.ts)、日付関数は `unit/training-dates.test.ts`） |
| 低 | 見え方（利用者ペルソナ） | P01・P03 でホーム・トレーニング記録・各履歴が表示される（実装済み: [tests/journeys/self-training-week.spec.ts](../../tests/journeys/self-training-week.spec.ts)） |
