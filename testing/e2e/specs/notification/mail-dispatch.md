# 通知・リマインダーのメール配信（送信待ち・配信停止・グループセッションのリマインダー）

## 概要

通知・リマインダーのメールは、業務処理の中で直接送らず、送信待ち（`com_t_mail_outbox`）に登録してから送信処理がまとめて送る。
送信処理は admin アプリの `/api/cron/mail-dispatch`（本体 `packages/lib/mail/dispatch/dispatchMail.ts`）で、pg_cron が5分ごとに pg_net で呼ぶ。
利用者は配信区分ごとにメールを停止できる（`com_t_user_mail_setting`）。最初の利用先は、グループセッションの開始24時間前・1時間前のリマインダー。
アカウント関連のメール（招待・パスワード再設定）はこの仕組みを通らず、停止もできない（[auth/password-reset-and-invite.md](../auth/password-reset-and-invite.md)）。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| 生徒 | プロフィール（メール通知） | `/profile` | `MailSettingsSection`、`getMyMailSettings` / `updateMyMailSetting`。画面仕様: [student/profile.md](../../../../docs/screens/student/profile.md) |
| コーチ | Profile（Email notifications） | `/profile` | `MailSettingsCard`、`getMyMailSettings` / `updateMyMailSetting`。画面仕様: [coach/profile.md](../../../../docs/screens/coach/profile.md) |
| 生徒 | ホーム・カレンダー（グループセッションの参加登録） | `/dashboard`、`/calendar` | `HomeEventCard`・`CalendarEventCard`、`joinCalendarEvent`。画面仕様: [student/dashboard.md](../../../../docs/screens/student/dashboard.md) |
| アドミン | カレンダーイベント管理（グループセッションの登録・担当コーチ） | `/calendar-events` | `CalendarEventFormDialog`。画面仕様: [admin/calendar-events/list.md](../../../../docs/screens/admin/calendar-events/list.md) |
| （システム） | 送信処理 | `/api/cron/mail-dispatch`（admin、ログイン不要・`CRON_SECRET` で保護） | `dispatchMail` |

## 前提条件

- 配信区分・メール種別の値の正本は `packages/lib/mail/dispatch/registry.ts`（DB はフリーテキスト）。
  - 区分: `NOTIFICATION`（チャット・マッチング・予約やキャンセル等。現在メール種別なし）／`REMINDER`（セッションの24時間前・1時間前）
  - 種別: `GROUP_SESSION_REMINDER`（区分 `REMINDER`）
  - 設定画面には、メール種別が1つ以上ある区分だけを出す。
- 配信設定の行が無い区分は「配信する」（初期値オン）。
- 送信処理の接続先は環境ごとに Supabase Vault の `mail_dispatch_url` / `mail_dispatch_secret` に置く。未登録の環境（dev）は pg_cron が登録だけを行い、
  送信はテストから送信処理を直接呼んで確かめる（`support/mailDispatch.ts` の `invokeMailDispatch`。秘密のキーは dev では `apps/admin/.env.local` の `CRON_SECRET`）。
- 送信処理は送信待ち全体を処理する。dev の admin は `MAIL_DISPATCH_RECIPIENT_ALLOWLIST=resend.dev` で送信先を Resend のテスト用アドレスに限定する。
  テストの宛先は `delivered+<tag>-<用途>@resend.dev`（`resendTestAddress`）、受信確認には `RESEND_TEST_READ_API_KEY` が要る（[CONVENTIONS.md](../../CONVENTIONS.md) 2章）。
- テストは使い捨ての顧客・生徒・イベントで行い、終了後に削除する（`support/authFixtures.ts`。送信待ち・配信設定はユーザーの削除で消える）。

## フロー（正常系）

1. リマインダーの登録（`enqueue_event_reminders`。pg_cron の5分ごとのジョブと送信処理の冒頭で実行）:
   公開中のグループセッションの参加登録者と担当コーチ（同じ人は1件）について、期限が来たものを送信待ちに登録する。
   - 24時間前: 開始の24時間前〜12時間前の間だけ登録（`dedup_key` = `<calendar_event_id>:24h`）
   - 1時間前: 開始の1時間前〜開始までの間だけ登録（`<calendar_event_id>:1h`）
   - `(user_id, mail_type, dedup_key)` の一意制約で、何度実行しても1件だけ。実行が1回飛んでも次の実行で拾う。
2. 送信（`dispatchMail`）: 送信待ちを古い順に最大40件確保し（`claim_mail_outbox`、`FOR UPDATE SKIP LOCKED`）、1件ずつ
   宛先の取得 → 配信設定の確認 → 最新の業務データで文面を組み立て → Resend で送信（送信元 `MAIL_FROM_NOTIFY`、未設定なら `MAIL_FROM_AUTH`）→ `SENT` と送信サービスのメッセージIDを記録。
3. 文面（グループセッション）: 生徒は日本語、コーチは英語。シリーズに属する回はセッション名の上にシリーズ名を載せる。日時は受信者のタイムゾーンで表示する。参加URL（未設定なら案内文）・アプリの詳細
   （生徒 `/dashboard`、コーチ `/calendar`）・メール通知の設定（`/profile`）へのリンクは宛先のポータルのURLで組み立てる。
   件名: 24時間前「【Gabby Blueprint】グループセッションのご案内（<日時>）」、1時間前「【Gabby Blueprint】まもなくグループセッションが始まります（<日時>）」。
4. 配信停止: プロフィールのスイッチを切り替えると、その場で配信設定を保存する（失敗したら元に戻す）。停止してもアプリ内の通知は届く。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果（`com_t_mail_outbox`） | 発生層 |
|---|---|---|---|
| 1 | 宛先が区分のメールを停止している | `SKIPPED`（`opted_out`）。送らない | サーバー |
| 2 | 送る時点でイベントが削除・非公開 | `SKIPPED`（`event_unavailable`） | サーバー |
| 3 | 送る時点で開始済み | `SKIPPED`（`event_started`） | サーバー |
| 4 | 送る時点で参加取消済みかつ担当コーチでもない | `SKIPPED`（`not_participating`） | サーバー |
| 5 | 開始の12時間前を切ってから参加登録した | 24時間前は登録しない（1時間前だけ届く） | DB |
| 6 | 宛先が予約済みドメイン（`.example` 等。固定アカウント） | `SKIPPED`（`undeliverable_address`） | サーバー |
| 7 | 宛先のドメインが許可リスト（`MAIL_DISPATCH_RECIPIENT_ALLOWLIST`、設定した環境のみ）に無い | `SKIPPED`（`recipient_not_allowlisted`） | サーバー |
| 8 | 宛先のユーザーが削除済み・メールアドレスなし | `SKIPPED`（`recipient_unavailable`） | サーバー |
| 9 | 送信・データ取得に失敗 | `PENDING` に戻し、試行回数×5分後に再試行。5回目の失敗で `FAILED` | サーバー |
| 10 | 送信処理が途中で止まり `SENDING` のまま10分経過 | 次回の確保で再度対象にする | DB |
| 11 | 送信処理を秘密のキー無し・不一致で呼ぶ | HTTP 401、何もしない | サーバー |
| 12 | 同じリマインダーの登録・送信処理を繰り返す | 2通目は送らない（一意制約） | DB |

## 関連RPC・テーブル

- RPC: `enqueue_event_reminders`、`claim_mail_outbox`（いずれも service_role のみ）、`private.invoke_mail_dispatch`（pg_cron から。pg_net で送信処理を呼ぶ）
- pg_cron のジョブ: `mail-dispatch-every-5min`（`supabase/DDL/function/invoke_mail_dispatch.sql`）
- テーブル: `com_t_mail_outbox`（RLS のポリシーなし＝service_role のみ）、`com_t_user_mail_setting`（本人の行のみ参照・登録・更新）、
  参照: `com_m_calendar_event`・`com_t_calendar_event_participant`・`com_t_calendar_event_coach`・`com_m_user`
- 実装参照: `packages/lib/mail/dispatch/`（`registry.ts`・`dispatchMail.ts`・`handlers/groupSessionReminder.ts`）、`packages/lib/mail/settingsActions.ts`、
  `packages/lib/mail/templates/EventReminderEmailTemplate.tsx`・`render.ts`（`renderEventReminderEmail`・`formatReminderSchedule`）、
  `apps/admin/app/api/cron/mail-dispatch/route.ts`
- 新しいメールの追加: `MAIL_TYPES` に種別を足し、`dispatchMail.ts` の `HANDLERS` に組み立て処理を登録し、送信待ちへの登録経路（業務処理または登録関数）を作る。
- 用語: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース

`testing/e2e/tests/mail/`（送信処理を直接呼ぶ。実際に送信するテストは desktop のみ）

| テスト | ファイル | 優先度 | 備考 |
|---|---|---|---|
| 秘密のキーが無い呼び出しは拒否する | `event-reminder.spec.ts` | 高 | 異常系11 |
| 1時間前・24時間前のリマインダーを送り、配信停止の人と期限外の予定には送らない（届いたメールの件名・本文、再実行で重複しない） | `event-reminder.spec.ts` | 高 | 正常系1〜3、異常系1・12、期限外（開始5時間前の予定）。`RESEND_TEST_READ_API_KEY`・`CRON_SECRET` 未設定ならスキップ |

グループセッションの参加登録（ホーム）は `testing/e2e/tests/home/group-session.spec.ts`。
メールの文面（日時の表記・言語・参加URLの有無・設定へのリンク）は、送信せずに `testing/unit/event-reminder-mail-content.test.ts` で確かめる。
