# 通知・リマインダーのメール配信（送信待ち・配信停止・出来事の通知・セッションのリマインダー）

## 概要

通知・リマインダーのメールは、業務処理の中で直接送らず、送信待ち（`com_t_mail_outbox`）に積んでから送信処理が送る。
送信処理は admin アプリの `/api/cron/mail-dispatch`（本体 `packages/lib/mail/dispatch/dispatchMail.ts`）で、DB から pg_net で呼ぶ。
メールには2つの積み方がある（送信処理・cron のジョブは共通で、メールの種類が増えても増やさない）。

| 積み方 | メール | 送るタイミング |
|---|---|---|
| 出来事が起きた時（アプリ内通知の登録をきっかけに、同じトランザクションで積む） | 予約・キャンセル・マッチング・宿題・月次レポートの通知、チャットの新着 | 処理の確定後すぐ（チャットは未読が10分続いたら） |
| 時刻が来た時（pg_cron の5分ごとのジョブで積む） | グループセッション・ライブセッションの開始24時間前・1時間前のリマインダー | 積んだ直後 |

利用者は配信区分ごとにメールを停止できる（`com_t_user_mail_setting`）。宛先は生徒（日本語）とコーチ（英語）で、管理者には送らない。
アカウント関連のメール（招待・パスワード再設定）は、本人がその場で待つためこの仕組みを通さず直接送り、停止もできない
（[auth/password-reset-and-invite.md](../auth/password-reset-and-invite.md)）。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| 生徒 | プロフィール（メール通知） | `/profile` | `MailSettingsSection`、`getMyMailSettings` / `updateMyMailSetting`。画面仕様: [student/profile.md](../../../../docs/screens/student/profile.md) |
| コーチ | Profile（Email notifications） | `/profile` | `MailSettingsCard`、`getMyMailSettings` / `updateMyMailSetting`。画面仕様: [coach/profile.md](../../../../docs/screens/coach/profile.md) |
| 生徒 | ホーム・カレンダー・グループセッション一覧（グループセッションの参加登録） | `/dashboard`、`/calendar`、`/group-sessions` | `joinCalendarEvent`。画面仕様: [student/group-sessions.md](../../../../docs/screens/student/group-sessions.md) |
| 生徒・コーチ | 予約・キャンセル・マッチング・チャット等（通知の元になる操作） | 各画面 | 各RPC（`fn_notify` 等）。メールの扱いは共通のトリガーが受け持つ |
| アドミン | カレンダーイベント管理（グループセッションの登録・担当コーチ） | `/calendar-events` | 画面仕様: [admin/calendar-events/list.md](../../../../docs/screens/admin/calendar-events/list.md) |
| （システム） | 送信処理 | `/api/cron/mail-dispatch`（admin、ログイン不要・`CRON_SECRET` で保護） | `dispatchMail` |

## 前提条件

- 配信区分・メール種別の値の正本は `packages/lib/mail/dispatch/registry.ts`（DB はフリーテキスト）。
  - 区分: `NOTIFICATION`（出来事の通知・チャット）／`REMINDER`（セッションの24時間前・1時間前）。設定画面には、メール種別が1つ以上ある区分だけを出す。
  - 種別: `NOTIFICATION`・`CHAT_UNREAD`（区分 `NOTIFICATION`）、`GROUP_SESSION_REMINDER`・`LIVE_SESSION_REMINDER`（区分 `REMINDER`）
  - 通知メールを送るアプリ内通知の種別（`NOTIFICATION_MAIL_TYPES`。DB のトリガー `enqueue_notification_mail` の一覧と同じにする）:
    - 生徒宛て: コーチによるキャンセル（`SESSION_CANCELLED_BY_COACH`）、振替候補の届け、予約の承認・不承認、マッチングの成立・不成立、宿題の届け
    - コーチ宛て: 生徒によるキャンセル・予約・振替候補の提案、予約リクエスト、新しい生徒とのマッチング、月次レポートの承認・承認取消
    - 両方: チャットの新着（`CHAT_NEW_MESSAGE` → メール種別 `CHAT_UNREAD`）
    - 送らない: 達成の通知（`TRAINING_*`）
- **管理者が行ったライブセッションの操作**（代理キャンセル・直接予約・直接マッチング・代理承認等）は、アプリ内通知もメールも送らない（運営が個別に連絡する）。
  `fn_notify` が、呼び出し元の JWT が管理者（`user_type='0'`）の場合に通知を登録しないため、メールも積まれない。
- 配信設定の行が無い区分は「配信する」（初期値オン）。
- 送信処理の接続先は環境ごとに Supabase Vault の `mail_dispatch_url` / `mail_dispatch_secret` に置く。未登録の環境（dev）は積むだけで送信処理を呼ばない。
  dev の送信はテストから送信処理を直接呼んで確かめる（`support/mailDispatch.ts` の `invokeMailDispatch`。秘密のキーは dev では `apps/admin/.env.local` の `CRON_SECRET`）。
- 送信処理は送信待ち全体を処理する。dev・staging の admin は `MAIL_DISPATCH_RECIPIENT_ALLOWLIST="resend.dev,gabbyacademy.com,gvtech.co.jp"` で送信先を Resend のテスト用アドレスと開発・運営のドメインに限定する（本番は設定しない）。
  テストの宛先は `delivered+<tag>-<用途>@resend.dev`（`resendTestAddress`）、受信確認には `RESEND_TEST_READ_API_KEY` が要る（[CONVENTIONS.md](../../CONVENTIONS.md) 2章）。
- テストは使い捨ての顧客・生徒・イベントで行い、終了後に削除する（`support/authFixtures.ts`。通知・送信待ち・配信設定はユーザーの削除で消える）。

## フロー（正常系）

1. **出来事の通知を積む**（トリガー `trg_notification_enqueue_mail`、`com_t_notification` の登録・更新時）: 宛先が生徒・コーチで、上記の種別の通知なら送信待ちに積む。
   - 通知（`NOTIFICATION`）: 通知の登録時に1件（`dedup_key` = 通知ID）。送る時刻は今。
   - チャット（`CHAT_UNREAD`）: 通知が未読になった時（新規・既読からの再未読）に1件、送る時刻は10分後。未読のまま続いた発言（同じ通知の更新）は同じ1件にまとめる。
     既読になった後の新着は新しい1件（`dedup_key` = 通知ID:未読になった時刻）。
2. **リマインダーを積む**（まとめ役 `enqueue_scheduled_mails`。pg_cron の5分ごとのジョブと送信処理の冒頭で実行）:
   期限が来たものを積む。24時間前は開始の24時間前〜12時間前の間だけ（直前に予約・参加登録した回には送らない）、1時間前は開始の1時間前〜開始まで。
   - グループセッション（`enqueue_event_reminders`）: 公開中の回の参加登録者と担当コーチ（同じ人は1件。`dedup_key` = `<calendar_event_id>:24h` / `:1h`）
   - ライブセッション（`enqueue_live_session_reminders`）: 予定（`status=1`）の回の生徒とコーチ（`dedup_key` = `<session_id>:24h` / `:1h`）
3. **送信処理を呼ぶ**: 送る時刻が来ている行が積まれたら、処理の確定後に送信処理を呼ぶ（トリガー `trg_mail_outbox_dispatch`。1つのトランザクションで1回だけ）。
   pg_cron の5分ごとのジョブは、送る時刻が来た行（チャットの10分後・失敗の再試行・取りこぼし）がある時だけ呼ぶ（`invoke_mail_dispatch_if_due`）。
4. **送信**（`dispatchMail`）: 送る時刻が来た行を古い順に最大40件確保し（`claim_mail_outbox`、`FOR UPDATE SKIP LOCKED`）、1件ずつ
   宛先の取得 → 配信設定の確認 → 最新の業務データで文面を組み立て → Resend で送信（送信元 `MAIL_FROM_NOTIFY`、未設定なら `MAIL_FROM_AUTH`）→ `SENT` と送信サービスのメッセージIDを記録。
5. **文面**: 生徒は日本語、コーチは英語。アプリ・設定へのリンクは宛先のポータルのURLで組み立てる。
   - 通知: アプリ内通知と同じタイトル・本文（日本語 `NOTIFICATION_MESSAGE_BUILDERS`、英語 `NOTIFICATION_MESSAGE_BUILDERS_EN`）に「アプリで確認する」（通知の `link_path`）。
     件名「【Gabby Blueprint】<タイトル>」／「[Gabby Blueprint] <タイトル>」。
   - チャット: 「<送信者>さんから新しいメッセージが届いています」／「New message from <sender>」と、メッセージの冒頭（引用）。
   - ライブセッション: 相手（生徒宛てはコーチ名、コーチ宛ては生徒名）と日時（受信者のタイムゾーン）。主ボタンは、1時間前は入室先
     （生徒: 通話画面 `/live-room/<session_id>`「入室する」と「開始5分前から入室できます。」／コーチ: セッションハブ `/students/<student_id>/sessions/<session_id>`「Open session」）、
     24時間前は確認先（生徒: `/live-room`「ライブセッションを確認する」とキャンセル・振替の案内／コーチ: セッションハブ「View session」）。
     件名: 24時間前「【Gabby Blueprint】ライブセッションのご案内（<日時>）」／「[Gabby Blueprint] Upcoming live session: <日時>」、
     1時間前「【Gabby Blueprint】まもなくライブセッションが始まります（<日時>）」／「[Gabby Blueprint] Your live session starts soon (<日時>)」。
   - グループセッション: シリーズに属する回はセッション名の上にシリーズ名を載せる。日時は受信者のタイムゾーン。参加URL（未設定なら案内文）・アプリの詳細
     （生徒 `/dashboard`、コーチ `/calendar`）。件名: 24時間前「【Gabby Blueprint】グループセッションのご案内（<日時>）」、1時間前「【Gabby Blueprint】まもなくグループセッションが始まります（<日時>）」。
6. **配信停止**: プロフィールのスイッチ（「通知」「リマインダー」）を切り替えると、その場で配信設定を保存する（失敗したら元に戻す）。停止してもアプリ内の通知は届く。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果（`com_t_mail_outbox`） | 発生層 |
|---|---|---|---|
| 1 | 宛先が区分のメールを停止している | `SKIPPED`（`opted_out`）。送らない | サーバー |
| 2 | 送る時点でイベントが削除・非公開 | `SKIPPED`（`event_unavailable`） | サーバー |
| 3 | 送る時点で開始済み | `SKIPPED`（`event_started`） | サーバー |
| 4 | 送る時点で参加取消済みかつ担当コーチでもない | `SKIPPED`（`not_participating`） | サーバー |
| 5 | 開始の12時間前を切ってから参加登録した | 24時間前は積まない（1時間前だけ届く） | DB |
| 6 | 宛先が予約済みドメイン（`.example` 等。固定アカウント） | `SKIPPED`（`undeliverable_address`） | サーバー |
| 7 | 宛先のドメインが許可リスト（`MAIL_DISPATCH_RECIPIENT_ALLOWLIST`、設定した環境のみ）に無い | `SKIPPED`（`recipient_not_allowlisted`） | サーバー |
| 8 | 宛先のユーザーが削除済み・メールアドレスなし | `SKIPPED`（`recipient_unavailable`） | サーバー |
| 9 | 送信・データ取得に失敗 | `PENDING` に戻し、試行回数×5分後に再試行（5分ごとのジョブが送る）。5回目の失敗で `FAILED` | サーバー |
| 10 | 送信処理が途中で止まり `SENDING` のまま10分経過 | 次回の確保で再度対象にする | DB |
| 11 | 送信処理を秘密のキー無し・不一致で呼ぶ | HTTP 401、何もしない | サーバー |
| 12 | 同じリマインダー・通知の登録や送信処理を繰り返す | 2通目は送らない（一意制約） | DB |
| 13 | 達成の通知（`TRAINING_*`）・管理者宛ての通知 | 積まない | DB |
| 14 | 管理者がライブセッションを操作した（代理キャンセル・直接予約・直接マッチング等） | 通知を登録しないため、積まない | DB |
| 15 | チャットの新着が、送る時点（10分後）で既読 | `SKIPPED`（`already_read`） | サーバー |
| 16 | 送る時点で通知が削除されている | `SKIPPED`（`notification_unavailable`） | サーバー |
| 17 | 送る時点でライブセッションが予定でない（キャンセル・振替・実施済み）・開始済み | `SKIPPED`（`session_unavailable` / `session_started`）。積む時点で予定でない回は積まない | 両方 |

## 関連RPC・テーブル

- 関数: `enqueue_scheduled_mails`（`enqueue_event_reminders`・`enqueue_live_session_reminders` を呼ぶ）、`claim_mail_outbox`（いずれも service_role のみ）、`fn_notify`（管理者の場合は登録しない）、
  `private.enqueue_notification_mail`（トリガー `trg_notification_enqueue_mail`）、`private.on_mail_outbox_inserted`（トリガー `trg_mail_outbox_dispatch`）、
  `private.request_mail_dispatch`・`private.invoke_mail_dispatch_if_due`・`private.invoke_mail_dispatch`（pg_net で送信処理を呼ぶ）
- pg_cron のジョブ: `mail-dispatch-every-5min`（`supabase/DDL/function/invoke_mail_dispatch.sql`）
- テーブル: `com_t_mail_outbox`（RLS のポリシーなし＝service_role のみ）、`com_t_user_mail_setting`（本人の行のみ参照・登録・更新）、
  参照: `com_t_notification`・`com_t_session`・`com_m_calendar_event`・`com_t_calendar_event_participant`・`com_t_calendar_event_coach`・`com_m_user`
- 実装参照: `packages/lib/mail/dispatch/`（`registry.ts`・`dispatchMail.ts`・`handlers/notification.ts`・`handlers/groupSessionReminder.ts`・`handlers/liveSessionReminder.ts`）、
  `packages/lib/mail/settingsActions.ts`、`packages/lib/mail/templates/`（`NotifyMailFrame.tsx`・`NotificationEmailTemplate.tsx`・`EventReminderEmailTemplate.tsx`・`LiveSessionReminderEmailTemplate.tsx`）・
  `render.ts`、`packages/types/notification.ts`・`notificationEn.ts`（通知の文言）、`apps/admin/app/api/cron/mail-dispatch/route.ts`
- 新しいメールの追加:
  - 出来事の通知: アプリ内通知の種別を `NOTIFICATION_MAIL_TYPES` と `enqueue_notification_mail` の一覧の両方に足す（文面はアプリ内通知の文言を使う）。
  - 時刻で送るメール: `MAIL_TYPES` に種別を足し、`dispatchMail.ts` の `HANDLERS` に組み立て処理を登録し、積む関数を作って `enqueue_scheduled_mails` から呼ぶ（cron のジョブは増やさない）。
- 用語: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース

`testing/e2e/tests/mail/`（送信処理を直接呼ぶ。実際に送信するテストは desktop のみ）

| テスト | ファイル | 優先度 | 備考 |
|---|---|---|---|
| 秘密のキーが無い呼び出しは拒否する | `event-reminder.spec.ts` | 高 | 異常系11 |
| 1時間前・24時間前のリマインダーを送り、配信停止の人と期限外の予定には送らない（届いたメールの件名・本文、再実行で重複しない） | `event-reminder.spec.ts` | 高 | 正常系2〜5、異常系1・12、期限外（開始5時間前の予定）。`RESEND_TEST_READ_API_KEY`・`CRON_SECRET` 未設定ならスキップ |
| ライブセッションの1時間前のリマインダーを生徒・コーチに積み、生徒に届く。キャンセル済みの回には送らない | `event-reminder.spec.ts` | 高 | 正常系2・4・5（ライブセッション）、異常系17。使い捨ての生徒にライブ付き契約・担当枠・セッションを直接作る（コーチは固定アカウントのため送らずに `undeliverable_address`）。セッションはチケットを直接参照するため、後始末で先に消す |
| 通知の登録ですぐ送るメールが積まれ、送信処理で届く。達成の通知・配信停止の人には送らない | `notification-mail.spec.ts` | 高 | 正常系1・4・5、異常系1・13。通知は直接登録して確かめる |
| チャットの新着は未読が10分続いたら1通。未読のままの続きはまとめ、既読後の新着は新しい1通 | `notification-mail.spec.ts` | 中 | 正常系1（チャット） |
| プロフィールに「通知」「リマインダー」の切り替えが出る | `notification-mail.spec.ts` | 低 | 閲覧のみ（固定アカウント） |

管理者の操作で通知が登録されないこと（異常系14）は、dev の DB で `fn_notify` を管理者・コーチの JWT で呼び、取り消し（ROLLBACK）付きで確かめた（E2E は無し）。
メールの文面（日時の表記・言語・参加URLの有無・設定へのリンク・通知の言語）は、送信せずに
`testing/unit/event-reminder-mail-content.test.ts`・`notification-mail-content.test.ts` で確かめる。
