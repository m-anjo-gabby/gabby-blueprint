<!--
  仕様書の索引。目的は「このタスクに関係する機能仕様書はどれか」を、各specファイルを
  開かずにこの1ファイルのgrep/一覧だけで特定できるようにすること（トークン節約）。
  新規specを追加・大きく変更したら、この表も1行追加/更新する。1行の情報量は増やしすぎない
  （詳細は各specファイル側に書く。ここは索引に徹する）。
-->

# 機能仕様書 索引

| ファイル | 概要 | 関与ロール | 主な関連RPC |
|---|---|---|---|
| [booking/individual-booking-and-reschedule.md](booking/individual-booking-and-reschedule.md) | 個別予約リクエスト・振替候補提案（承認制の日時提案フロー） | 生徒, コーチ | `create_session_booking_request`, `approve_slot_proposal`, `reject_slot_proposal`, `withdraw_session_booking_request`, `cancel_session` |
| [monitoring/student-monitor-dashboard.md](monitoring/student-monitor-dashboard.md) | モニターロールを持つ生徒による、同一契約先受講生の横断モニタリング（アクセス制御と対象生徒抽出） | 生徒（モニターロール保有/非保有） | `get_monitor_user_list`, `get_monitor_word_history`, `get_monitor_sprint_history`, `get_monitor_sprint_drill_history` |
| [admin/live-session-management.md](admin/live-session-management.md) | アドミンによるライブセッション代理操作（キャンセル・予約・直接マッチング・コーチ交代・コマ単位のセッション数個別調整） | アドミン | `cancel_session`, `admin_book_session_direct`, `admin_match_student_with_coach`, `release_lesson_schedule_slot`, `admin_adjust_schedule_target_sessions`, `fn_schedule_shortfall` |
| [auth/password-reset-and-invite.md](auth/password-reset-and-invite.md) | パスワード再設定（リンク確認・使用済み・ログイン中の直接表示）・招待からの本登録・ログイン画面の案内。再設定メールの文面と受信（Resend） | 未ログインの利用者（全ロール）, 招待された利用者 | なし（Supabase Auth） |
| [chat/chat-messaging.md](chat/chat-messaging.md) | チャットのやり取り（2ペイン・未読・1対1の既読・添付の貼り付け/ドロップ・直接リンク） | 生徒, コーチ, アドミン | `fn_ensure_one_on_one_chat_room`（トリガー `notify_chat_new_message`） |
| [favorites/student-favorites.md](favorites/student-favorites.md) | 生徒のお気に入り（教材・フレーズ・スプリント問題の登録・検索/連動絞り込み・解除・1人種別ごと1,000件の上限・非公開教材の非表示・戻る/進むでの取り直し） | 生徒 | なし（トリガー `fn_check_favorite_limit`） |
| [training/training-stats.md](training/training-stats.md) | 自主トレーニングの実績の集計（日次の記録・実施日数・連続日数・通算値・月次・達成の通知。生徒のタイムゾーンでの日付、レポートは日本時間の期間。月の境界・タイムゾーン） | 生徒, 生徒（モニター）, アドミン | `increment_word_summary`, `increment_sprint_summary`, `get_user_training_performance`, `get_training_report_data`（内部 `update_training_lifetime_stats`・トリガー `notify_training_milestone`） |
| [training/speaking-flow.md](training/speaking-flow.md) | 発話の流れ（単語帳の発話ボタン・スプリントの種別ごとの再生順 → チャイム → 発話評価、発話評価OFF、ドリルの発話ボタン、停止での確定・切替での中断。E2E はテスト用の認識方式で検証） | 生徒 | なし（ブラウザ内の評価） |
| [notification/mail-dispatch.md](notification/mail-dispatch.md) | 通知・リマインダーのメール配信（送信待ち・送信処理・区分ごとの配信停止・出来事の通知メール〔チャットは未読10分〕・管理者の操作は通知しない・グループセッション/ライブセッションの24時間前/1時間前のリマインダー） | 生徒, コーチ, （システム） | `enqueue_scheduled_mails`, `claim_mail_outbox`, `fn_notify`（トリガー `enqueue_notification_mail`・pg_cron `mail-dispatch-every-5min`） |

## 未着手ドメイン（ファイルが無い＝仕様書はまだ存在しない）

- `matching/` — 初回マッチング申請〜承認
- `session-lifecycle/` — セッション実施・終了処理・無断欠席対応
- `homework/` — 宿題（本体・チェックリスト・フォローアップコメント）
- `monthly-report/` — 月次コーチングレポート・支払通知書
