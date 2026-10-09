# グループセッション（シリーズ・配信対象・参加登録・アナウンス・リマインダー）

## 概要

アドミンがグループセッション（カレンダーイベントの種別 `GROUP_SESSION`）をシリーズ（企画）ごとにまとめて登録・公開し、配信対象の生徒が回ごと・シリーズごとに参加登録する。参加登録した生徒にだけ参加URLを見せ、アナウンスと開始前のリマインダーメールを届ける。担当コーチは自分の担当の回を見られ、アナウンス・リマインダーを受け取る。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| アドミン | シリーズの一覧・作成・詳細 | `admin` `/calendar-events/series`、`/new`、`/[seriesId]` | `SeriesCreateForm.tsx`・`SeriesSessionsFields.tsx`・`AddSeriesSessionsDialog.tsx`。画面仕様: [docs/screens/admin/calendar-events/series.md](../../../../docs/screens/admin/calendar-events/series.md) |
| アドミン | カレンダーイベントの一覧（単発の登録・編集） | `admin` `/calendar-events` | 画面仕様: [docs/screens/admin/calendar-events/list.md](../../../../docs/screens/admin/calendar-events/list.md) |
| アドミン | 参加者・アナウンス管理 | `admin` `/calendar-events/[id]/participants` | `CalendarEventAnnouncementPanel.tsx`。画面仕様: [docs/screens/admin/calendar-events/participants.md](../../../../docs/screens/admin/calendar-events/participants.md) |
| 生徒 | ホームのグループセッション | `student` `/dashboard` | `HomeEventSection.tsx`。画面仕様: [docs/screens/student/dashboard.md](../../../../docs/screens/student/dashboard.md) |
| 生徒 | グループセッション一覧 | `student` `/group-sessions` | `GroupSessionsView.tsx`・`SeriesCard.tsx`。画面仕様: [docs/screens/student/group-sessions.md](../../../../docs/screens/student/group-sessions.md) |
| 生徒 | イベントの詳細（ホーム・一覧・カレンダー共通のボトムシート） | `student` | `components/calendarEvent/`（`EventDetailDrawer.tsx`・`CalendarEventCard.tsx`・`useEventParticipation.ts`）。画面仕様: [docs/screens/student/calendar.md](../../../../docs/screens/student/calendar.md) |
| コーチ | カレンダー | `coach` `/calendar` | 画面仕様: [docs/screens/coach/calendar.md](../../../../docs/screens/coach/calendar.md) |

## 前提条件

- アドミン: [`../../FIXTURES.md`](../../FIXTURES.md) の `qa-admin`。
- 生徒: 配信対象の顧客に所属していること（「生徒全体」なら全生徒）。プランは問わない（アプリのみ契約を含む）。リマインダーメールはライセンスが有効な生徒にだけ送る。
- 状態を変えるテスト（参加登録・公開）は、使い捨ての顧客を配信対象にする（`support/calendarEventFixtures.ts`、`support/authFixtures.ts`）。開発・ステージングで「生徒全体」に公開しない。

## フロー（正常系）

1. アドミンがシリーズを作る（シリーズ名・説明と、各回の日付〔日本時間〕・開始/終了時刻・内容・担当コーチ。全回共通の配信対象・参加URL〔回ごとにも設定可〕・公開）。シリーズと回はまとめて1回の処理で登録する（`admin_create_calendar_event_series`）。回はあとからシリーズの詳細で追加できる（`admin_add_calendar_event_series_sessions`）。グループセッションは参加確認が必須（`rsvp_enabled = true`）。
2. 公開した回が、配信対象の生徒に表示される。
   - 2a. 配信対象が「生徒全体」（`target_type = 'ALL'`）: すべての生徒。
   - 2b. 「顧客指定」（`target_type = 'CLIENT'`）: その顧客に所属する生徒だけ。
   - 2c. 担当コーチ（`com_t_calendar_event_coach`）: 配信対象に関わらず、担当の回を見られる。担当でないコーチには見えない（`target_type = 'COACH'` のイベントを除く）。
   - ホームは今後30日以内に始まる開催前・開催中の回、一覧の「これから」は今後120日以内に始まる回を出す。終了の判定は終了時刻（無い場合は開始から1時間）。
3. 生徒が参加登録する。
   - 3a. 回ごとの「参加する」（`joinCalendarEvent`）。
   - 3b. 一覧のシリーズの「すべての回に参加する（n回）」（`joinCalendarEventSeries`）。終了していない参加確認ありの回のうち未登録のものをまとめて登録する。登録済みの回はそのまま。
   - 参加登録すると「参加予定」になり、参加URLがあれば「入室する」（新しいタブで開く）と「お使いのカレンダーに追加」が出る。参加登録の前は参加URLを出さない。
4. 生徒が回ごとに参加を取り消す（イベントの詳細の「キャンセル」→ 確認）。まとめての取り消しは無い。
5. アドミンが参加者一覧を確かめ、アナウンス（タイトル・本文・添付）を送る。アナウンスはその回の参加者・担当コーチがイベントの詳細で見られる（`com_t_calendar_event_message`。返信・既読の管理は無く、アプリ内の通知・メールは出さない）。
6. 開始24時間前（〜12時間前までの間）と1時間前（〜開始までの間）に、参加登録した生徒と担当コーチへリマインダーメールを積んで送る（`enqueue_event_reminders`・pg_cron `mail-dispatch-every-5min`。詳細は [specs/notification](../notification/mail-dispatch.md)）。同じ回・同じ時点のリマインダーは1通だけ。
7. 終了後、参加登録した回は生徒の一覧の「過去のセッション」（直近183日）に出る。実際に入室したかは記録しない。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | グループセッションで参加確認を外そうとする | スイッチがオンのまま操作できない（ほかの種別では切り替えられる） | UI |
| 2 | 顧客指定で対象顧客を選ばずにシリーズを作る | 送信できない（入力エラー） | UI |
| 3 | 非公開の回 | 生徒・コーチのどの画面にも出ず、リマインダーも送らない | 両方（RLS・`enqueue_event_reminders`） |
| 4 | 顧客指定の回を、別の顧客の生徒が見る | 一覧・ホーム・カレンダーに出ない | RPC（RLS） |
| 5 | 配信対象ではない回に、生徒が本人の参加登録の行を直接作る | **登録できてしまう**（参加登録の RLS は本人の行かどうかだけを確かめる）。登録すると、その回のアナウンスを読め、リマインダーメールに参加URLが載る。回のIDは配信対象外の生徒の画面には出ないため、通常は到達しない（2026-10-10 に dev で確認） | RPC（UI導線なし） |
| 6 | 終了した回に参加登録しようとする | 画面には「参加する」を出さない。「すべての回に参加する」は終了した回を除く | UI |
| 7 | 参加登録が二重になる（同じ回で「参加する」と「すべての回に参加する」） | 1件のまま（`user_id, calendar_event_id` で上書き） | 両方 |
| 8 | リマインダーの宛先の生徒が配信を停止している・ライセンスが無い | 送信待ちには積むが送らない（`opted_out`・`recipient_unlicensed`） | RPC（[specs/notification](../notification/mail-dispatch.md)） |
| 9 | 参加URLが未設定の回に参加登録する | 「入室用のリンクは決まり次第ここに表示されます。」を出す | UI |

## 関連RPC・テーブル

- RPC: `admin_create_calendar_event_series`, `admin_add_calendar_event_series_sessions`, `enqueue_event_reminders`
- テーブル: `com_m_calendar_event`（`event_type`・`target_type`・`client_id`・`rsvp_enabled`・`is_published`・`series_id`・`location_url`）, `com_m_calendar_event_series`, `com_t_calendar_event_participant`, `com_t_calendar_event_coach`, `com_t_calendar_event_message`, `com_t_mail_outbox`
- 実装参照: `packages/lib/calendarEvent/actions/calendarEventActions.ts`（`getPublishedCalendarEventsCore`・`joinCalendarEventCore`・`joinCalendarEventSeriesCore`・`cancelCalendarEventParticipationCore`）, `apps/admin/actions/adminCalendarEventAction.ts`, `packages/lib/mail/dispatch/handlers/groupSessionReminder.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 企画から参加・アナウンス・リマインダー・振り返りまで | 実装済み: ジャーニー `e2e/tests/journeys/group-session.spec.ts` |
| 高 | 参加登録で参加URLが出て、詳細から取り消せる | 実装済み: `e2e/tests/home/group-session.spec.ts` |
| 高 | シリーズの一覧・すべての回に参加・過去のセッション | 実装済み: `e2e/tests/home/group-session-list.spec.ts` |
| 高 | 24時間前・1時間前のリマインダー（配信停止・ライセンスなし・期限外） | 実装済み: `e2e/tests/mail/event-reminder.spec.ts` |
| 中 | アドミンのシリーズ作成（回ごとの参加URL・参加確認の固定） | 実装済み: `e2e/tests/home/group-session.spec.ts`（アドミンのイベント登録） |
| 中 | 顧客指定の回が別の顧客の生徒に出ない（#4） | 未作成 |
| 中 | 配信対象外の回に直接参加登録できない（#5） | 未作成（現状は登録できてしまうため、扱いを決めてから作る） |
