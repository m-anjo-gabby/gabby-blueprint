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

## 未着手ドメイン（ファイルが無い＝仕様書はまだ存在しない）

- `matching/` — 初回マッチング申請〜承認
- `session-lifecycle/` — セッション実施・終了処理・無断欠席対応
- `homework/` — 宿題（本体・チェックリスト・フォローアップコメント）
- `monthly-report/` — 月次コーチングレポート・支払通知書
