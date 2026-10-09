# グループセッション（企画・参加・アナウンス・リマインダー・振り返り）

## 概要

- 対象ロール: アドミン（運営）、生徒（全プラン。アプリのみ契約を含む）、担当コーチ
- なぜ重要か: 契約者向けの無料セッションで、アドミンの企画（シリーズ・配信先・公開）から、生徒の参加登録、アナウンス・リマインダーの配信、終了後の振り返りまでが複数のアプリとメールにまたがる。配信先や参加登録を誤ると、対象外の顧客に表示される・入室用のリンクやリマインダーが届かない、といった実害になる。
- 前後のジャーニー: 生徒が利用を始めた後（[生徒の初日](./student-first-day.md)）に、契約期間中に繰り返す。
- E2E: [tests/journeys/group-session.spec.ts](../tests/journeys/group-session.spec.ts)（手順1〜8）

## 前提データ

| 目的 | 使うアカウント | 備考 |
|---|---|---|
| 参加者 | 使い捨ての顧客の生徒（アプリのみ契約）。宛先は Resend のテスト用アドレス | リマインダーメールを受け取るため（[FIXTURES.md](../../FIXTURES.md)） |
| 担当コーチ | 使い捨てのコーチ | |
| 企画・配信の実行者 | 状態ペルソナのアドミン（`qa-admin`） | 配信先は使い捨ての顧客に限る（生徒全体に配信しない） |

## ステップ

| # | 実行者 | 操作 | 期待する状態 | 参照仕様書 | 補足 |
|---|---|---|---|---|---|
| 1 | アドミン | シリーズの新規作成で、シリーズ名・説明・配信対象（顧客指定）・参加URL・公開を設定し、2回分（1回目に担当コーチ）を登録する | シリーズの詳細へ移り、2回とも参加確認あり・公開・顧客指定で登録される | [docs/screens/admin/calendar-events/series.md](../../../docs/screens/admin/calendar-events/series.md) | グループセッションは参加確認が必須。日時は日本時間で入れる。2回目は「回を追加（1週間後）」 |
| 2 | 生徒 | ホームのグループセッションを見て、「一覧を見る」からシリーズの「すべての回に参加する」を押す | ホームに次の回がシリーズ名・担当コーチつきで出て、参加前は入室用のリンクを出さない。参加後は2回とも「入室する」が出る | [docs/screens/student/dashboard.md](../../../docs/screens/student/dashboard.md)（グループセッション）、[docs/screens/student/group-sessions.md](../../../docs/screens/student/group-sessions.md) | 回ごとに「参加する」でも登録できる |
| 3 | アドミン | 1回目の「参加者」で参加者を確かめ、「アナウンス」から送信する | 参加者一覧に生徒が出る。アナウンスが送信される | [docs/screens/admin/calendar-events/participants.md](../../../docs/screens/admin/calendar-events/participants.md) | アナウンスは参加者・担当コーチに配信する（返信・既読の管理は無い。アプリ内の通知・メールは出さない） |
| 4 | 生徒 | ホームの次の回の「詳細」を開く | 「参加予定」が付き、詳細にアナウンスが出る | [docs/screens/student/calendar.md](../../../docs/screens/student/calendar.md)（イベントの詳細） | |
| 5 | 担当コーチ | カレンダーを開く | 担当の回が出る（顧客指定の回でも、担当コーチには見える） | [docs/screens/coach/calendar.md](../../../docs/screens/coach/calendar.md) | |
| 6 | システム | 送信処理（pg_cron `mail-dispatch-every-5min`）が動く | 開始1時間前の期限内の回について、参加登録した生徒にリマインダーメールが届く（入室用のリンクつき） | [specs/notification](../specs/notification/mail-dispatch.md)（リマインダー） | 24時間前も同じ。配信停止・ライセンスの無い生徒には送らない（E2E: `tests/mail/event-reminder.spec.ts`） |
| 7 | 生徒 | 一覧で2回目の「詳細」から参加を取り消す | 2回目が「参加する」に戻る | [docs/screens/student/group-sessions.md](../../../docs/screens/student/group-sessions.md) | まとめての取り消しは無い（回ごと） |
| 8 | 生徒 | 1回目の終了後に一覧を開く | 「これから」には2回目だけが残り、「過去のセッション」に1回目が出る | [docs/screens/student/group-sessions.md](../../../docs/screens/student/group-sessions.md) | 過去のセッションは参加登録の記録（実際に入室したかは分からない）。E2E は終了を待てないため、1回目の日時を過去へずらす |

## 業務ルール

- グループセッションは参加確認が必須。参加URLは参加登録した人にだけ表示する。
- 配信対象は「生徒全体」か「顧客指定」。顧客指定の回は、その顧客の生徒と担当コーチだけが見られる。
- リマインダーは参加登録した生徒に、開始24時間前・1時間前に送る（区分「リマインダー」で配信を停止できる）。

## 未整備の依存ドメイン

- **グループセッション（業務フロー）** — シリーズ・回・参加登録・アナウンス・配信対象をまとめたドメイン仕様書が無い（画面仕様書に分散している）。リマインダーは [specs/notification](../specs/notification/mail-dispatch.md) にある
