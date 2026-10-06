-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20261004-dev
-- 作成日: 2026-10-05
--
-- 【内容】
--   グループセッションのホーム表示（全プランの生徒）。
--
--   1. 既存のグループセッション（com_m_calendar_event.event_type = 'GROUP_SESSION'）の
--      参加確認（rsvp_enabled）を有効にする
--      - グループセッションは参加確認が必須になった（アドミンの登録時に強制。正本は
--        packages/types/calendarEvent.ts の CALENDAR_EVENT_TYPES.rsvpRequired）。
--        参加URLは参加登録した生徒/コーチにだけ表示する。
--      - スキーマ変更は無いため、アプリのデプロイとの前後は問わない。
--
-- 【実行方法】
--   supabase/release/README.md の手順に従い run.mjs で適用してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--
-- 【staging・本番の作業手順（手作業を含む。staging で予行演習してから本番で同じ手順を行う）】
--   このリリースはメールの送信基盤を含み、SQL の適用だけでは完結しない。以下を上から順に行う。
--   STEP 0. 事前確認
--     - admin の環境変数 NEXT_PUBLIC_STUDENT_URL / NEXT_PUBLIC_COACH_URL が、その環境の生徒・コーチのポータルの
--       https の URL になっていること（メール内のリンク・配信停止のリンクに使う。招待メールでも使用中）。
--       ※ apps/admin/.env.staging の控えは http:// で、NEXT_PUBLIC_SITE_URL が生徒のポータルを指している。Vercel の実際の値を確認する。
--     - Resend の Domains で送信ドメイン mail.gabbyacademy.com が Verified であること（MAIL_FROM_NOTIFY も同じドメインで送る）。
--   STEP 1. SQL の適用（アプリのデプロイより先）
--       node supabase/release/run.mjs 20261004_feature-20261004-dev_release.sql --env=<staging|prod> --sections=pending
--   STEP 2. アプリの環境変数を Vercel に設定する（下の【アプリの環境変数】。秘密の値は環境ごとに別の値を作る）
--       ランダムな値の作り方: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
--   STEP 3. admin・student・coach をデプロイする
--   STEP 4. Supabase Vault に送信処理の接続先を登録する（下の【Supabase Vault の登録】）
--       これを行うまで、通知・リマインダーは送信待ちに積まれるだけで送られない（送信処理が呼ばれない）。
--   STEP 5. Resend の Webhook を登録し、RESEND_WEBHOOK_SECRET を設定して admin を再デプロイする（下の【Resend の Webhook の登録】）
--   STEP 6. 動作確認（下の【動作確認】）
--   ※ dev は STEP 4・5 を行わない（ローカルの admin には DB・Resend から届かないため。送信はテストから送信処理を呼んで確かめる）。
--
-- 【アプリの環境変数（Vercel。staging・prod それぞれで設定し、再デプロイする）】
--   このリリースで追加・変更する環境変数の一覧（このスクリプトでは設定されない。手作業）。
--   | アプリ                | 変数                              | 値・備考
--   | admin                 | CRON_SECRET                       | 十分に長いランダムな文字列。Vault の mail_dispatch_secret と同じ値（STEP 4）
--   | admin                 | MAIL_FROM_NOTIFY                  | 通知・リマインダーの送信元（例: Gabby Blueprint <notify@mail.gabbyacademy.com>。staging は先頭に [STG] を付ける）
--   | admin                 | MAIL_DISPATCH_MODE                | 【必須】通知・リマインダーのメールの送信の範囲。本番 "all"、staging "allowlist"。
--   |                       |                                   | 未設定・"off" は送らない（緊急停止にも使う。招待・パスワード再設定は対象外）
--   | admin                 | MAIL_DISPATCH_RECIPIENT_ALLOWLIST | staging のみ "resend.dev,gabbyacademy.com,gvtech.co.jp"（MAIL_DISPATCH_MODE=allowlist の送信先。本番は設定しない）
--   | admin                 | RESEND_WEBHOOK_SECRET             | Resend の Webhook の Signing Secret（whsec_...。STEP 5 で表示される値。環境ごとに別）
--   | admin                 | MAIL_OPS_ALERT_TO                 | 運営向けのメール配信の日次の要約の宛先（カンマ区切り。問題があった日だけ 09:00 JST に送る。
--   |                       |                                   | 未設定なら送らない。staging は運営の社内アドレス、または設定しない）
--   | admin・student・coach | MAIL_UNSUBSCRIBE_SECRET           | 3アプリで同じ値（十分に長いランダムな文字列）。ログイン不要の配信停止リンクの署名鍵。
--   |                       |                                   | 未設定でもメールは送られるが、配信停止リンク・List-Unsubscribe ヘッダーが付かない
--   | （任意）admin・student・coach | MAIL_LOGO_URL             | 通常は設定しない（メールのロゴは本番の https://blueprint.gabbyacademy.com/mail-logo.png）。
--   |                       |                                   | 本番に未反映の画像で staging を確認する場合だけ https://<student の staging>/mail-logo.png
--   メールのロゴは生徒アプリの public/mail-logo.png のため、本番の生徒アプリをデプロイするまで、どの環境のメールでもロゴは表示されない。
--
-- 【Supabase Vault の登録（STEP 4。その環境の Supabase の SQL エディタで1回）】
--   pg_cron・通知の登録時に、DB から admin の送信処理（/api/cron/mail-dispatch）を呼ぶための接続先と秘密のキー。
--     SELECT vault.create_secret('https://<admin のURL>/api/cron/mail-dispatch', 'mail_dispatch_url');
--     SELECT vault.create_secret('<admin の CRON_SECRET と同じ値>', 'mail_dispatch_secret');
--   本番の admin の URL は https://blueprint-admin.gabbyacademy.com。
--   既に登録済みの場合は、SELECT id, name FROM vault.secrets WHERE name LIKE 'mail_dispatch_%'; で id を確認し、
--   vault.update_secret('<id>', '<新しい値>') で更新する（同じ名前で create_secret すると重複エラーになる）。
--
-- 【Resend の Webhook の登録（STEP 5。環境ごとに1つ）】
--   メールの到達状況（到達・不達・迷惑メールの報告等）を admin の /api/webhooks/resend で受け取り、com_t_mail_event に記録する。
--   1. Resend のダッシュボード → Webhooks → Add Webhook
--   2. Endpoint URL: https://<admin のURL>/api/webhooks/resend
--      （本番: https://blueprint-admin.gabbyacademy.com/api/webhooks/resend）
--   3. Events: email.sent / email.delivered / email.delivery_delayed / email.bounced / email.complained /
--      email.failed / email.suppressed の7つを選ぶ（email.opened・email.clicked・contact.*・domain.* は不要）
--   4. 作成後に表示される Signing Secret（whsec_...）を、その環境の admin の環境変数 RESEND_WEBHOOK_SECRET に設定し、admin を再デプロイする
--   ※ Resend の Webhook はアカウント単位のため、dev・staging・本番が同じ Resend のアカウントを使うと、各エンドポイントに
--     全環境のメールの出来事が届く。送信時に付けるタグ env（Supabase のプロジェクトID）で、自分の環境のメールの出来事だけを記録する
--     （他の環境の出来事は 200 を返して捨てる）。staging と本番でそれぞれ1つずつ登録する。
--   ※ RESEND_WEBHOOK_SECRET が未設定・不一致の間は 401 を返す（Resend が再送を続けた後、失敗として記録される）。
--     登録から再デプロイまでの間に送ったメールの到達状況は記録されないことがある（送信自体には影響しない）。
--
-- 【動作確認（STEP 6。その環境の Supabase の SQL エディタ）】
--   a. pg_cron のジョブが3つあること
--        SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'mail-%' ORDER BY jobname;
--        → mail-daily-report（0 0 * * *）・mail-dispatch-every-5min（*/5 * * * *）・mail-history-purge-daily（30 18 * * *）
--   b. 送信処理の呼び出しが成功していること（5分ほど待ってから。status_code が 200）
--        SELECT created, status_code, left(content, 200) FROM net._http_response ORDER BY created DESC LIMIT 5;
--      401 の場合は Vault の mail_dispatch_secret と admin の CRON_SECRET の不一致、404 は mail_dispatch_url の誤り。
--   c. 到達状況の記録: 自分のアドレスへパスワード再設定のメールを送り、数分後に記録されていること
--        SELECT event_type, mail_kind, recipient, occurred_at FROM com_t_mail_event ORDER BY occurred_at DESC LIMIT 5;
--      （email.sent・email.delivered が password_reset で記録される。記録されない場合は Resend の Webhooks の画面で配信結果を確認する）
--   d. 送信待ちに滞留・失敗が無いこと
--        SELECT status, count(*) FROM com_t_mail_outbox GROUP BY status;
--      PENDING が増え続ける場合は MAIL_DISPATCH_MODE の設定漏れ（STEP 2）か Vault の未登録（STEP 4）。
-- =========================================================================

BEGIN;

UPDATE public.com_m_calendar_event
SET rsvp_enabled = TRUE,
    update_date = NOW()
WHERE event_type = 'GROUP_SESSION'
  AND rsvp_enabled = FALSE;

COMMIT;

-- =========================================================================
-- 【追加セクション】通知・リマインダーのメール基盤とグループセッションのリマインダー
-- 追加日: 2026-10-05
--
-- 【内容】
--   1. com_t_mail_outbox（メール送信待ち・送信履歴）を新規作成
--   2. com_t_user_mail_setting（メール配信設定。区分ごとの配信・停止）を新規作成
--   3. enqueue_event_reminders()（グループセッションの24時間前・1時間前のリマインダーを登録）を新規作成
--   4. claim_mail_outbox(integer, integer)（送信処理が送るメールを確保）を新規作成
--   5. pg_net を有効化し、private.invoke_mail_dispatch()（送信処理の呼び出し）と
--      pg_cron のジョブ 'mail-dispatch-every-5min' を作成
--
-- 対応ファイル: DDL/table/com_t_mail_outbox.sql, DDL/table/com_t_user_mail_setting.sql,
--   DDL/function/enqueue_event_reminders.sql, DDL/function/claim_mail_outbox.sql,
--   DDL/function/invoke_mail_dispatch.sql
-- 【注意】アプリ（プロフィールのメール通知・admin の /api/cron/mail-dispatch）が 1〜4 を使うため、
--   アプリのデプロイより先に適用すること。
-- 【適用後の手作業（staging・prod。送信処理を呼ぶ環境ごとに1回）】
--   a. admin アプリ（Vercel）の環境変数に CRON_SECRET（十分に長いランダムな文字列）と
--      MAIL_FROM_NOTIFY（例: Gabby Blueprint <notify@mail.gabbyacademy.com>）を設定して再デプロイする
--      （他の環境変数を含む一覧は、ファイル冒頭の【アプリの環境変数】）
--   b. SQL エディタで Vault に送信処理のURLと秘密のキーを登録する（a の CRON_SECRET と同じ値）
--        SELECT vault.create_secret('https://<admin のURL>/api/cron/mail-dispatch', 'mail_dispatch_url');
--        SELECT vault.create_secret('<CRON_SECRET>', 'mail_dispatch_secret');
--   b を行うまでは、リマインダーの登録だけが行われ、メールは送られない。
--   dev は Vault を登録しない（ローカルの admin には DB から届かないため。送信は手元から確認する）。
-- =========================================================================

BEGIN;


---------------------------------------------
-- DDL: com_t_mail_outbox (メール送信待ち・送信履歴) (2026-10-05 追加)
---------------------------------------------
-- 【背景】
-- 通知・リマインダーのメールを、業務処理の中で直接送らず「送信待ち」として記録してから
-- 送信処理（admin の /api/cron/mail-dispatch。本体は packages/lib/mail/dispatch/）がまとめて送る。
-- 業務処理がメールの失敗に巻き込まれず、再送・失敗の調査・送信履歴の確認ができる。
--
-- 【種別・区分】
-- mail_type（GROUP_SESSION_REMINDER 等）と category（NOTIFICATION / REMINDER 等）は
-- CHECK制約を持たないフリーテキストとし、値の正本は packages/lib/mail/dispatch/registry.ts
-- （com_t_notification.notification_type と同じ方針）。category は配信停止の設定
-- （com_t_user_mail_setting）の単位。
--
-- 【重複防止】
-- (user_id, mail_type, dedup_key) で一意。リマインダーは「イベントID:24h」等を入れ、
-- 登録処理を何度実行しても1回しか送らない。
--
-- 【状態】
-- PENDING（送信待ち）→ SENDING（送信処理が確保中）→ SENT（送信済み）/ SKIPPED（送らなかった。
-- 配信停止・予定の取消・開始済み等。理由は last_error）/ FAILED（再試行の上限に達した）。
-- 送信に失敗した行は attempts を加算して PENDING に戻し、次回の送信処理で再試行する。
-- SENDING のまま一定時間経った行（送信処理の異常終了）は、次回の確保時に再度対象にする（claim_mail_outbox）。
--
-- 生徒・コーチ・管理者の画面からは参照しない（RLSを有効にしてポリシーを作らない＝service_roleのみ）。
---------------------------------------------
CREATE TABLE public.com_t_mail_outbox (
    mail_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    mail_type VARCHAR(50) NOT NULL,
    category VARCHAR(30) NOT NULL,
    dedup_key VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    provider_message_id TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_mail_outbox_status CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'SKIPPED', 'FAILED')),
    UNIQUE (user_id, mail_type, dedup_key)
);

COMMENT ON TABLE public.com_t_mail_outbox IS 'メール送信待ち・送信履歴（通知・リマインダーのメール。送信は送信処理がまとめて行う）';
COMMENT ON COLUMN public.com_t_mail_outbox.mail_id IS 'メールID';
COMMENT ON COLUMN public.com_t_mail_outbox.user_id IS '宛先ユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_mail_outbox.mail_type IS 'メール種別 (例: GROUP_SESSION_REMINDER)。正本は packages/lib/mail/dispatch/registry.ts';
COMMENT ON COLUMN public.com_t_mail_outbox.category IS '配信区分 (NOTIFICATION / REMINDER 等)。配信停止の設定(com_t_user_mail_setting)の単位';
COMMENT ON COLUMN public.com_t_mail_outbox.dedup_key IS '重複防止キー（同一の宛先・種別で一意。例: <calendar_event_id>:24h）';
COMMENT ON COLUMN public.com_t_mail_outbox.payload IS '文面の組み立てに必要なパラメータ (JSONB、種別ごとに内容が異なる。表示内容は送信時に最新の業務データから組み立てる)';
COMMENT ON COLUMN public.com_t_mail_outbox.status IS '状態 (PENDING: 送信待ち / SENDING: 送信処理が確保中 / SENT: 送信済み / SKIPPED: 送らなかった / FAILED: 再試行の上限に達した)';
COMMENT ON COLUMN public.com_t_mail_outbox.scheduled_at IS '送信予定日時（この日時以降に送る）';
COMMENT ON COLUMN public.com_t_mail_outbox.attempts IS '送信の試行回数';
COMMENT ON COLUMN public.com_t_mail_outbox.locked_at IS '送信処理が確保した日時（SENDING の間）';
COMMENT ON COLUMN public.com_t_mail_outbox.last_error IS '直近の失敗内容、または送らなかった理由';
COMMENT ON COLUMN public.com_t_mail_outbox.provider_message_id IS '送信サービス(Resend)のメッセージID';
COMMENT ON COLUMN public.com_t_mail_outbox.sent_at IS '送信日時';
COMMENT ON COLUMN public.com_t_mail_outbox.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_mail_outbox.update_date IS '更新日時';

CREATE INDEX idx_mail_outbox_pending ON public.com_t_mail_outbox (scheduled_at) WHERE status IN ('PENDING', 'SENDING');
CREATE INDEX idx_mail_outbox_user ON public.com_t_mail_outbox (user_id, insert_date DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
-- ポリシーを作らない（service_role の送信処理と SECURITY DEFINER 関数だけが読み書きする）
---------------------------------------------
ALTER TABLE public.com_t_mail_outbox ENABLE ROW LEVEL SECURITY;

---------------------------------------------
-- DDL: com_t_user_mail_setting (メール配信設定) (2026-10-05 追加)
---------------------------------------------
-- 【背景】
-- 通知・リマインダーのメールを、利用者が区分ごとに停止できるようにする。
-- 行が無い区分は「配信する」として扱う（初期値オン。停止・再開した区分だけ行を持つ）。
-- 区分（category）の値の正本は packages/lib/mail/dispatch/registry.ts の MAIL_CATEGORIES。
-- アカウント関連（招待・パスワード再設定）は停止できないため、本テーブルの対象外。
-- 停止してもアプリ内の通知（com_t_notification）は届く。
---------------------------------------------
CREATE TABLE public.com_t_user_mail_setting (
    user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    category VARCHAR(30) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, category)
);

COMMENT ON TABLE public.com_t_user_mail_setting IS 'メール配信設定（区分ごとの配信・停止。行が無い区分は配信する）';
COMMENT ON COLUMN public.com_t_user_mail_setting.user_id IS 'ユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_user_mail_setting.category IS '配信区分 (NOTIFICATION / REMINDER 等)。正本は packages/lib/mail/dispatch/registry.ts';
COMMENT ON COLUMN public.com_t_user_mail_setting.enabled IS '配信する (TRUE: 配信 / FALSE: 停止)';
COMMENT ON COLUMN public.com_t_user_mail_setting.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_mail_setting.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
-- 本人の行だけを参照・登録・更新できる（プロフィール画面のサーバーアクションから更新する）
---------------------------------------------
ALTER TABLE public.com_t_user_mail_setting ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own mail settings" ON public.com_t_user_mail_setting;
DROP POLICY IF EXISTS "Users can insert their own mail settings" ON public.com_t_user_mail_setting;
DROP POLICY IF EXISTS "Users can update their own mail settings" ON public.com_t_user_mail_setting;

CREATE POLICY "Users can view their own mail settings" ON public.com_t_user_mail_setting
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own mail settings" ON public.com_t_user_mail_setting
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own mail settings" ON public.com_t_user_mail_setting
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

---------------------------------------------
-- enqueue_event_reminders: イベント（グループセッション）のリマインダーメールを送信待ちに登録する (2026-10-05 追加)
---------------------------------------------
-- 【呼び出し元】
-- pg_cron のジョブ 'mail-dispatch-every-5min'（invoke_mail_dispatch.sql）から5分ごとに実行する。
--
-- 【対象】
-- 公開中のグループセッションの参加登録者（com_t_calendar_event_participant）と
-- 担当コーチ（com_t_calendar_event_coach）。同じ人が両方に該当しても1通にする。
--
-- 【送る時刻】
-- 開始の24時間前（'24h'）と1時間前（'1h'）。「期限が来ていて、まだ登録していないもの」を拾うため、
-- 実行が1回飛んでも次の実行で取りこぼさない。重複は com_t_mail_outbox の一意制約で防ぐ。
-- ただし期限を大きく過ぎた古い案内は送らない:
--   24h … 開始の24時間前〜12時間前の間だけ登録（開始の12時間前を切ってから参加登録した人には送らない）
--   1h  … 開始の1時間前〜開始までの間だけ登録
-- 開始後・取消・参加取消の確認は、送信処理が送る直前に最新のデータで行う（SKIPPED にする）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_event_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH leads(lead_key, lead_from, lead_to) AS (
        VALUES
            ('24h', INTERVAL '24 hours', INTERVAL '12 hours'),
            ('1h', INTERVAL '1 hour', INTERVAL '0 hours')
    ),
    due_events AS (
        SELECT e.calendar_event_id, l.lead_key
        FROM public.com_m_calendar_event e
        JOIN leads l
          ON NOW() >= e.start_datetime - l.lead_from
         AND NOW() < e.start_datetime - l.lead_to
        WHERE e.event_type = 'GROUP_SESSION'
          AND e.is_published = TRUE
          AND e.delete_flg = '0'
    ),
    recipients AS (
        SELECT d.calendar_event_id, d.lead_key, p.user_id
        FROM due_events d
        JOIN public.com_t_calendar_event_participant p ON p.calendar_event_id = d.calendar_event_id
        UNION
        SELECT d.calendar_event_id, d.lead_key, c.coach_id
        FROM due_events d
        JOIN public.com_t_calendar_event_coach c ON c.calendar_event_id = d.calendar_event_id
    )
    INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
    SELECT r.user_id,
           'GROUP_SESSION_REMINDER',
           'REMINDER',
           r.calendar_event_id::text || ':' || r.lead_key,
           jsonb_build_object('calendar_event_id', r.calendar_event_id, 'lead', r.lead_key)
    FROM recipients r
    JOIN public.com_m_user u ON u.id = r.user_id AND u.delete_flg = '0'
    ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_event_reminders() FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- claim_mail_outbox: 送信処理が送るメールを確保する (2026-10-05 追加)
---------------------------------------------
-- 送信予定日時を過ぎた送信待ち（PENDING）と、確保したまま一定時間経った行（送信処理の異常終了で
-- SENDING のまま残ったもの）を、古い順に p_limit 件まで SENDING にして返す。
-- FOR UPDATE SKIP LOCKED で確保するため、送信処理が同時に動いても同じメールを二重に送らない。
-- 確保の時点で attempts を加算する（送信処理側は結果に応じて SENT / SKIPPED / PENDING / FAILED に更新する）。
-- 呼び出し元: packages/lib/mail/dispatch/dispatchMail.ts（service_role）
---------------------------------------------
DROP FUNCTION IF EXISTS public.claim_mail_outbox(integer, integer);

CREATE OR REPLACE FUNCTION public.claim_mail_outbox(p_limit integer, p_lock_timeout_minutes integer DEFAULT 10)
RETURNS SETOF public.com_t_mail_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.com_t_mail_outbox o
    SET status = 'SENDING',
        locked_at = NOW(),
        attempts = o.attempts + 1,
        update_date = NOW()
    WHERE o.mail_id IN (
        SELECT t.mail_id
        FROM public.com_t_mail_outbox t
        WHERE (t.status = 'PENDING' AND t.scheduled_at <= NOW())
           OR (t.status = 'SENDING' AND t.locked_at < NOW() - make_interval(mins => p_lock_timeout_minutes))
        ORDER BY t.scheduled_at
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING o.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_mail_outbox(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mail_outbox(integer, integer) TO service_role;

---------------------------------------------
-- invoke_mail_dispatch: メールの送信処理（admin の /api/cron/mail-dispatch）を呼び出す＋5分ごとのジョブ (2026-10-05 追加)
---------------------------------------------
-- 【方式】
-- pg_cron で5分ごとに、リマインダーの登録（enqueue_event_reminders）と送信処理の呼び出しを行う。
-- 送信処理は Next.js（admin アプリ）の Route Handler で、メールの文面（React のテンプレート）を
-- 組み立てて Resend で送る。DB から HTTP で呼ぶため pg_net を使う。
--
-- 【接続先の設定（環境ごとに1回、手作業）】
-- 送信処理のURLと秘密のキーは Supabase Vault に保存する（リポジトリには置かない）。
--   SELECT vault.create_secret('https://<admin のURL>/api/cron/mail-dispatch', 'mail_dispatch_url');
--   SELECT vault.create_secret('<admin の環境変数 CRON_SECRET と同じ値>', 'mail_dispatch_secret');
-- 変更する場合は vault.update_secret(<id>, '<新しい値>') を使う。
-- どちらかが未設定の環境（ローカルの admin しか無い dev 等）では呼び出しを行わない
-- （登録だけ行い、送信は手元から /api/cron/mail-dispatch を呼んで確認する）。
---------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION private.invoke_mail_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url text;
    v_secret text;
BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'mail_dispatch_url';
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'mail_dispatch_secret';
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION private.invoke_mail_dispatch() FROM PUBLIC, anon, authenticated;

-- 同名ジョブが既に存在する場合は入れ替える（何度再実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mail-dispatch-every-5min';

SELECT cron.schedule(
    'mail-dispatch-every-5min',
    '*/5 * * * *',
    $$ SELECT public.enqueue_event_reminders(); SELECT private.invoke_mail_dispatch(); $$
);

COMMIT;

-- =========================================================================
-- 【追加セクション】グループセッションのシリーズ
-- 追加日: 2026-10-05
--
-- 【内容】
--   1. com_m_calendar_event_series（シリーズ＝企画）を新規作成し、com_m_calendar_event に series_id 列を追加
--      - 単発のイベントは series_id を持たない（既存のイベントはすべて単発のまま）
--   2. admin_add_calendar_event_series_sessions(uuid, jsonb)（シリーズに複数の回をまとめて登録）を新規作成
--
-- 対応ファイル: DDL/table/com_m_calendar_event_series.sql, DDL/function/admin_add_calendar_event_series_sessions.sql
-- 【注意】アプリ（アドミンのシリーズ管理、生徒・コーチのイベント表示）が series_id 列を参照するため、
--   アプリのデプロイより先に適用すること。
-- =========================================================================

BEGIN;


---------------------------------------------
-- DDL: com_m_calendar_event_series (カレンダーイベントのシリーズ) (2026-10-05 追加)
---------------------------------------------
-- 【背景】
-- グループセッションは「10月の発音グループセッション」「10月のビジネス英語ミニセッション」のような企画（シリーズ）ごとに、
-- 複数の回（com_m_calendar_event）を開催する。シリーズは企画の名前・紹介文（月のテーマ等）を1か所で持ち、各回はシリーズを
-- 参照する（com_m_calendar_event.series_id）。単発のイベントは series_id を持たない。
--
-- 【持つ情報の分担】
-- シリーズ: 企画のタイトル・説明（表示用。例: 「10月の発音グループセッション」と、その月のテーマの説明）。翌月は新しいシリーズを作る。
-- 各回: 日時・内容・参加URL・配信対象・公開・参加確認・担当コーチ（従来どおり）。
-- 生徒の一覧取得・参加登録・リマインダーは各回の行だけで判定するため、シリーズの有無に影響されない。
-- 回の並び順は開始日時の順（順番の列は持たない）。
---------------------------------------------
CREATE TABLE public.com_m_calendar_event_series (
    series_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(30) NOT NULL DEFAULT 'GROUP_SESSION',
    title TEXT NOT NULL,
    description TEXT,
    delete_flg TEXT NOT NULL DEFAULT '0',
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_calendar_event_series IS 'カレンダーイベントのシリーズ（グループセッションの企画。各回は com_m_calendar_event.series_id で参照する）';
COMMENT ON COLUMN public.com_m_calendar_event_series.series_id IS 'シリーズID';
COMMENT ON COLUMN public.com_m_calendar_event_series.event_type IS 'イベント種別（各回の event_type と同じ値。正本は packages/types/calendarEvent.ts）';
COMMENT ON COLUMN public.com_m_calendar_event_series.title IS 'シリーズ名（企画名。例: 10月の発音グループセッション）';
COMMENT ON COLUMN public.com_m_calendar_event_series.description IS 'シリーズの説明（企画の紹介文、任意）';
COMMENT ON COLUMN public.com_m_calendar_event_series.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_calendar_event_series.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_calendar_event_series.update_date IS '更新日時';

---------------------------------------------
-- 各回からの参照（com_m_calendar_event.series_id）
-- シリーズを物理削除した場合、各回は単発のイベントとして残る（ON DELETE SET NULL）。
---------------------------------------------
ALTER TABLE public.com_m_calendar_event
    ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.com_m_calendar_event_series(series_id) ON DELETE SET NULL;

COMMENT ON COLUMN public.com_m_calendar_event.series_id IS 'シリーズID（com_m_calendar_event_series。単発のイベントは NULL）';

CREATE INDEX IF NOT EXISTS idx_calendar_event_series ON public.com_m_calendar_event (series_id) WHERE series_id IS NOT NULL;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_calendar_event_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage calendar event series" ON public.com_m_calendar_event_series;
DROP POLICY IF EXISTS "Users can view series of visible events" ON public.com_m_calendar_event_series;

CREATE POLICY "Admin can manage calendar event series" ON public.com_m_calendar_event_series
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

-- 生徒/コーチは、自分に見える回（com_m_calendar_event の RLS で判定）が1件以上あるシリーズだけを閲覧できる
CREATE POLICY "Users can view series of visible events" ON public.com_m_calendar_event_series
FOR SELECT TO authenticated USING (
    delete_flg = '0'
    AND EXISTS (
        SELECT 1 FROM public.com_m_calendar_event e
        WHERE e.series_id = com_m_calendar_event_series.series_id
    )
);

---------------------------------------------
-- admin_add_calendar_event_series_sessions: シリーズに複数の回をまとめて登録する (2026-10-05 追加)
---------------------------------------------
-- アドミンのシリーズ詳細「回をまとめて追加」から呼ぶ（admin アプリのサーバーアクション、service_role）。
-- 各回（com_m_calendar_event）と担当コーチ（com_t_calendar_event_coach）を1つのトランザクションで登録し、
-- 途中で失敗した場合は1件も登録しない。
-- 各回の event_type はシリーズと同じにする。参加確認（rsvp_enabled）は呼び出し側で種別の rsvpRequired に従って渡す。
--
-- p_sessions: [{ "title", "description", "start_datetime", "end_datetime", "location_url",
--                "target_type", "client_id", "rsvp_enabled", "is_published", "coach_ids": [uuid, ...] }, ...]
-- 戻り値: 登録した回のID（登録順）
---------------------------------------------
DROP FUNCTION IF EXISTS public.admin_add_calendar_event_series_sessions(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.admin_add_calendar_event_series_sessions(p_series_id uuid, p_sessions jsonb)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_type varchar(30);
    v_session jsonb;
    v_event_id uuid;
BEGIN
    SELECT event_type INTO v_event_type
    FROM public.com_m_calendar_event_series
    WHERE series_id = p_series_id AND delete_flg = '0';
    IF v_event_type IS NULL THEN
        RAISE EXCEPTION 'series_not_found';
    END IF;
    IF jsonb_typeof(p_sessions) <> 'array' OR jsonb_array_length(p_sessions) = 0 THEN
        RAISE EXCEPTION 'sessions_required';
    END IF;

    FOR v_session IN SELECT value FROM jsonb_array_elements(p_sessions)
    LOOP
        INSERT INTO public.com_m_calendar_event (
            event_type, series_id, title, description, start_datetime, end_datetime, location_url,
            target_type, client_id, rsvp_enabled, is_published
        ) VALUES (
            v_event_type,
            p_series_id,
            v_session->>'title',
            NULLIF(v_session->>'description', ''),
            (v_session->>'start_datetime')::timestamptz,
            NULLIF(v_session->>'end_datetime', '')::timestamptz,
            NULLIF(v_session->>'location_url', ''),
            COALESCE(v_session->>'target_type', 'ALL'),
            NULLIF(v_session->>'client_id', '')::uuid,
            COALESCE((v_session->>'rsvp_enabled')::boolean, FALSE),
            COALESCE((v_session->>'is_published')::boolean, FALSE)
        )
        RETURNING calendar_event_id INTO v_event_id;

        INSERT INTO public.com_t_calendar_event_coach (calendar_event_id, coach_id)
        SELECT v_event_id, coach_id::uuid
        FROM jsonb_array_elements_text(COALESCE(v_session->'coach_ids', '[]'::jsonb)) AS coach_id;

        RETURN NEXT v_event_id;
    END LOOP;

    UPDATE public.com_m_calendar_event_series SET update_date = NOW() WHERE series_id = p_series_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_add_calendar_event_series_sessions(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_calendar_event_series_sessions(uuid, jsonb) TO service_role;

COMMIT;

-- =========================================================================
-- 【追加セクション】出来事の通知メール（予約・キャンセル・マッチング・チャット等）と、管理者の操作の通知の停止
-- 追加日: 2026-10-05
--
-- 【内容】
--   1. fn_notify: 呼び出し元が管理者（JWT の user_type='0'）の場合は通知を登録しない
--      - 管理者が行ったライブセッションの操作（代理キャンセル・直接予約・直接マッチング・代理承認等）は、
--        アプリ内通知もメールも送らない（運営が個別に連絡する）。シグネチャは変更しない。
--   2. private.enqueue_notification_mail() とトリガー trg_notification_enqueue_mail（com_t_notification）
--      - 通知の登録をきっかけに、生徒・コーチ宛ての通知メールを送信待ちに積む（チャットは未読が10分続いたら）
--   3. 送信処理の呼び出しの見直し（DDL/function/invoke_mail_dispatch.sql を再適用）
--      - すぐ送るメールが積まれたら、処理の確定後に送信処理を呼ぶ（トリガー trg_mail_outbox_dispatch。1つの処理で1回）
--      - 5分ごとのジョブは、送る時刻が来た送信待ちがある時だけ送信処理を呼ぶ（invoke_mail_dispatch_if_due）
--
-- 対応ファイル: DDL/function/fn_notify.sql, DDL/function/enqueue_notification_mail.sql, DDL/function/invoke_mail_dispatch.sql
-- 【注意】第2セクション（メール基盤）の後に適用すること。アプリ（admin の送信処理・生徒/コーチのメール通知の設定）の
--   デプロイの前後は問わないが、送信処理（NOTIFICATION / CHAT_UNREAD の組み立て）が無い間に積まれた行は、
--   送信処理が「不明な種別」として送らない（SKIPPED）ため、アプリのデプロイ後に適用するのが望ましい。
-- =========================================================================

BEGIN;


---------------------------------------------
-- 通知INSERT共通ヘルパー関数 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- ライブセッション関連のRPC群が、それぞれ独自に
--   INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
--   VALUES (...);
-- を約15箇所で直接記述しており、com_t_notificationのカラム構成を知っている箇所が
-- 分散していた。本関数に集約し、呼び出し元は「誰に・何を・どこへのリンクで」のみを
-- 意識すればよいようにする。内部処理専用（authenticatedへの直接公開は不要。
-- 任意のuser_idへ通知を送れてしまうため、SECURITY DEFINER関数経由以外での実行は許さない）。
--
-- 【管理者の操作は通知しない (2026-10-05)】
-- 管理者が行ったライブセッションの操作（代理キャンセル・直接予約・直接マッチング・代理承認等）は、
-- 生徒・コーチへ通知しない（運営が個別に連絡する）。呼び出し元の JWT が管理者（user_type='0'）の場合は登録しない。
-- 通知メール（enqueue_notification_mail）は通知の登録をきっかけに作るため、通知が無ければメールも送られない。
-- 本関数を使うのはライブセッション関連の RPC だけで、チャット・月次レポートの通知は別の経路（影響しない）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify(
    p_user_id uuid,
    p_notification_type text,
    p_payload jsonb,
    p_link_path text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    SELECT p_user_id, p_notification_type, p_payload, p_link_path
    WHERE public.get_jwt_user_type() IS DISTINCT FROM '0';
$$;

REVOKE EXECUTE ON FUNCTION public.fn_notify(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- enqueue_notification_mail: アプリ内通知（com_t_notification）の登録をきっかけに、通知メールを送信待ちに積む (2026-10-05 追加)
---------------------------------------------
-- 【方式】
-- 予約・キャンセル・マッチング・チャット等の出来事は、すべてアプリ内通知として com_t_notification に登録される
-- （ライブセッション関連は fn_notify、チャットは notify_chat_new_message、宿題・月次レポートは各RPC）。
-- 本トリガーで通知の登録と同じトランザクションの中で送信待ち（com_t_mail_outbox）に積むため、
-- 各RPCを変更せずに、業務データと通知メールの整合が取れる（処理が失敗すればメールも積まれない）。
-- 積んだメールは、処理の確定後に送信処理を呼んで（on_mail_outbox_inserted）すぐに送る。
--
-- 【対象】（値の正本は packages/lib/mail/dispatch/registry.ts の NOTIFICATION_MAIL_TYPES。変更する場合は両方を直す。
--   一致は単体テスト testing/unit/mail-dispatch-policy.test.ts で確かめる）
-- 宛先が生徒（user_type='1'）・コーチ（'2'）の通知のうち、下記の種別。管理者宛ては送らない。
-- 達成の通知（TRAINING_*）と、管理者の操作による通知（*_BY_ADMIN。fn_notify で登録しなくなった）は送らない。
--   mail_type='NOTIFICATION' … 通知の登録時に1通（dedup_key = notification_id）
--   mail_type='CHAT_UNREAD'  … チャットの新着。未読になった時点から10分後に送る（送る直前に既読なら送らない）。
--                              未読のまま続いた発言（同じ通知行の更新）は、同じ1通にまとめる。
--                              既読になった後の新着は新しい1通（dedup_key = notification_id:未読になった時刻）。
---------------------------------------------
CREATE OR REPLACE FUNCTION private.enqueue_notification_mail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_type text;
BEGIN
    IF NEW.is_read THEN
        RETURN NULL;
    END IF;
    IF NOT (NEW.notification_type = ANY (ARRAY[
        -- 生徒宛て
        'SESSION_CANCELLED_BY_COACH',
        'SESSION_RESCHEDULE_PROPOSED',
        'SESSION_BOOKING_APPROVED',
        'SESSION_BOOKING_REJECTED',
        'MATCHING_APPROVED',
        'MATCHING_REJECTED',
        'HOMEWORK_POSTED',
        -- コーチ宛て
        'SESSION_CANCELLED_BY_STUDENT',
        'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT',
        'SESSION_BOOKED_BY_STUDENT',
        'SESSION_BOOKING_REQUESTED',
        'MATCHING_ASSIGNED_TO_COACH',
        'COACH_REPORT_APPROVED',
        'COACH_REPORT_APPROVAL_REVOKED',
        -- 両方
        'CHAT_NEW_MESSAGE'
    ])) THEN
        RETURN NULL;
    END IF;

    SELECT user_type INTO v_user_type FROM public.com_m_user WHERE id = NEW.user_id AND delete_flg = '0';
    IF v_user_type IS NULL OR v_user_type NOT IN ('1', '2') THEN
        RETURN NULL;
    END IF;

    IF NEW.notification_type = 'CHAT_NEW_MESSAGE' THEN
        -- 未読になった時（新規・既読からの再未読）だけ積む。未読のまま続く発言は、既に積んだ1通にまとめる
        IF TG_OP = 'UPDATE' AND NOT OLD.is_read THEN
            RETURN NULL;
        END IF;
        INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload, scheduled_at)
        VALUES (
            NEW.user_id,
            'CHAT_UNREAD',
            'NOTIFICATION',
            NEW.notification_id::text || ':' || floor(extract(epoch FROM NEW.occurred_at))::bigint::text,
            jsonb_build_object('notification_id', NEW.notification_id),
            NOW() + INTERVAL '10 minutes'
        )
        ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
        VALUES (
            NEW.user_id,
            'NOTIFICATION',
            'NOTIFICATION',
            NEW.notification_id::text,
            jsonb_build_object('notification_id', NEW.notification_id)
        )
        ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.enqueue_notification_mail() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notification_enqueue_mail ON public.com_t_notification;
CREATE TRIGGER trg_notification_enqueue_mail
AFTER INSERT OR UPDATE ON public.com_t_notification
FOR EACH ROW EXECUTE FUNCTION private.enqueue_notification_mail();

---------------------------------------------
-- invoke_mail_dispatch: メールの送信処理（admin の /api/cron/mail-dispatch）を呼び出す＋5分ごとのジョブ (2026-10-05 追加)
---------------------------------------------
-- 【方式】
-- 送信処理は Next.js（admin アプリ）の Route Handler で、メールの文面（React のテンプレート）を
-- 組み立てて Resend で送る。DB から HTTP で呼ぶため pg_net を使う（呼び出しは処理の確定後に行われる）。
-- 送信処理を呼ぶのは次の2つ（cron のジョブは1つだけで、メールの種類が増えても増やさない）。
--   1. すぐ送るメールを送信待ちに積んだ時（on_mail_outbox_inserted。通知メール等。1つの処理の中では1回だけ呼ぶ）
--   2. pg_cron の5分ごとのジョブ: リマインダーの登録（enqueue_event_reminders）の後、送る時刻が来た送信待ち
--      （チャットの10分後・失敗の再試行・取りこぼし）がある時だけ呼ぶ（invoke_mail_dispatch_if_due）
--
-- 【接続先の設定（環境ごとに1回、手作業）】
-- 送信処理のURLと秘密のキーは Supabase Vault に保存する（リポジトリには置かない）。
--   SELECT vault.create_secret('https://<admin のURL>/api/cron/mail-dispatch', 'mail_dispatch_url');
--   SELECT vault.create_secret('<admin の環境変数 CRON_SECRET と同じ値>', 'mail_dispatch_secret');
-- 変更する場合は vault.update_secret(<id>, '<新しい値>') を使う。
-- どちらかが未設定の環境（ローカルの admin しか無い dev 等）では呼び出しを行わない
-- （登録だけ行い、送信は手元から /api/cron/mail-dispatch を呼んで確認する）。
---------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION private.invoke_mail_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url text;
    v_secret text;
BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'mail_dispatch_url';
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'mail_dispatch_secret';
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION private.invoke_mail_dispatch() FROM PUBLIC, anon, authenticated;

-- 1つのトランザクションの中で送信処理を呼ぶのは1回だけにする（1つの処理で複数の通知が積まれても1回）
CREATE OR REPLACE FUNCTION private.request_mail_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_setting('gabby.mail_dispatch_requested', true) = 'on' THEN
        RETURN;
    END IF;
    PERFORM set_config('gabby.mail_dispatch_requested', 'on', true);
    PERFORM private.invoke_mail_dispatch();
END;
$$;

REVOKE EXECUTE ON FUNCTION private.request_mail_dispatch() FROM PUBLIC, anon, authenticated;

-- 送る時刻が来た送信待ち（または送信処理が止まって確保されたままの行）がある時だけ、送信処理を呼ぶ（5分ごとのジョブ用）
CREATE OR REPLACE FUNCTION private.invoke_mail_dispatch_if_due()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.com_t_mail_outbox
        WHERE (status = 'PENDING' AND scheduled_at <= NOW())
           OR (status = 'SENDING' AND locked_at < NOW() - INTERVAL '10 minutes')
    ) THEN
        PERFORM private.request_mail_dispatch();
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.invoke_mail_dispatch_if_due() FROM PUBLIC, anon, authenticated;

-- すぐ送るメール（送る時刻が来ている行）が積まれたら、処理の確定後に送信処理を呼ぶ
CREATE OR REPLACE FUNCTION private.on_mail_outbox_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM new_rows WHERE status = 'PENDING' AND scheduled_at <= NOW()) THEN
        PERFORM private.request_mail_dispatch();
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.on_mail_outbox_inserted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mail_outbox_dispatch ON public.com_t_mail_outbox;
CREATE TRIGGER trg_mail_outbox_dispatch
AFTER INSERT ON public.com_t_mail_outbox
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION private.on_mail_outbox_inserted();

-- 同名ジョブが既に存在する場合は入れ替える（何度再実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mail-dispatch-every-5min';

SELECT cron.schedule(
    'mail-dispatch-every-5min',
    '*/5 * * * *',
    $$ SELECT public.enqueue_event_reminders(); SELECT private.invoke_mail_dispatch_if_due(); $$
);

COMMIT;

-- =========================================================================
-- 【追加セクション】ライブセッションの開始前（24時間前・1時間前）のリマインダーメール
-- 追加日: 2026-10-06
--
-- 【内容】
--   1. enqueue_live_session_reminders()（予定のライブセッションの生徒・コーチ宛てのリマインダーを登録）を新規作成
--   2. enqueue_scheduled_mails()（時刻で送るメールの登録のまとめ役。グループセッション＋ライブセッション）を新規作成
--   3. pg_cron のジョブ 'mail-dispatch-every-5min' を、enqueue_scheduled_mails を呼ぶ形に入れ替え
--      （DDL/function/invoke_mail_dispatch.sql を再適用。ジョブは1つのまま）
--
-- 対応ファイル: DDL/function/enqueue_live_session_reminders.sql, DDL/function/invoke_mail_dispatch.sql
-- 【注意】admin の送信処理が enqueue_scheduled_mails を呼ぶため、アプリのデプロイより先に適用すること
--   （先にアプリだけデプロイすると、送信処理の冒頭の登録が失敗する。送信自体は続く）。
-- =========================================================================

BEGIN;


---------------------------------------------
-- enqueue_event_reminders: イベント（グループセッション）のリマインダーメールを送信待ちに登録する (2026-10-05 追加)
---------------------------------------------
-- 【呼び出し元】
-- 時刻で送るメールの登録のまとめ役 enqueue_scheduled_mails（enqueue_live_session_reminders.sql）経由で、
-- pg_cron のジョブ 'mail-dispatch-every-5min'（invoke_mail_dispatch.sql）と送信処理の冒頭から実行する。
--
-- 【対象】
-- 公開中のグループセッションの参加登録者（com_t_calendar_event_participant）と
-- 担当コーチ（com_t_calendar_event_coach）。同じ人が両方に該当しても1通にする。
--
-- 【送る時刻】
-- 開始の24時間前（'24h'）と1時間前（'1h'）。「期限が来ていて、まだ登録していないもの」を拾うため、
-- 実行が1回飛んでも次の実行で取りこぼさない。重複は com_t_mail_outbox の一意制約で防ぐ。
-- ただし期限を大きく過ぎた古い案内は送らない:
--   24h … 開始の24時間前〜12時間前の間だけ登録（開始の12時間前を切ってから参加登録した人には送らない）
--   1h  … 開始の1時間前〜開始までの間だけ登録
-- 開始後・取消・参加取消の確認は、送信処理が送る直前に最新のデータで行う（SKIPPED にする）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_event_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH leads(lead_key, lead_from, lead_to) AS (
        VALUES
            ('24h', INTERVAL '24 hours', INTERVAL '12 hours'),
            ('1h', INTERVAL '1 hour', INTERVAL '0 hours')
    ),
    due_events AS (
        SELECT e.calendar_event_id, l.lead_key
        FROM public.com_m_calendar_event e
        JOIN leads l
          ON NOW() >= e.start_datetime - l.lead_from
         AND NOW() < e.start_datetime - l.lead_to
        WHERE e.event_type = 'GROUP_SESSION'
          AND e.is_published = TRUE
          AND e.delete_flg = '0'
    ),
    recipients AS (
        SELECT d.calendar_event_id, d.lead_key, p.user_id
        FROM due_events d
        JOIN public.com_t_calendar_event_participant p ON p.calendar_event_id = d.calendar_event_id
        UNION
        SELECT d.calendar_event_id, d.lead_key, c.coach_id
        FROM due_events d
        JOIN public.com_t_calendar_event_coach c ON c.calendar_event_id = d.calendar_event_id
    )
    INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
    SELECT r.user_id,
           'GROUP_SESSION_REMINDER',
           'REMINDER',
           r.calendar_event_id::text || ':' || r.lead_key,
           jsonb_build_object('calendar_event_id', r.calendar_event_id, 'lead', r.lead_key)
    FROM recipients r
    JOIN public.com_m_user u ON u.id = r.user_id AND u.delete_flg = '0'
    ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_event_reminders() FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- enqueue_live_session_reminders: ライブセッションのリマインダーメールを送信待ちに登録する (2026-10-06 追加)
-- enqueue_scheduled_mails: 時刻で送るメールの登録のまとめ役（pg_cron の5分ごとのジョブ・送信処理の冒頭から呼ぶ）
---------------------------------------------
-- 【対象】
-- 予定（status=1）のライブセッションの生徒とコーチ。
--
-- 【送る時刻】（グループセッション enqueue_event_reminders と同じ）
-- 開始の24時間前（'24h'）と1時間前（'1h'）。「期限が来ていて、まだ登録していないもの」を拾う。重複は一意制約で防ぐ。
--   24h … 開始の24時間前〜12時間前の間だけ登録（直前に予約・振替した回には送らない）
--   1h  … 開始の1時間前〜開始までの間だけ登録
-- キャンセル・振替（振替後は別のセッション行）・開始済みの確認は、送信処理が送る直前に最新のデータで行う（SKIPPED にする）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_live_session_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH leads(lead_key, lead_from, lead_to) AS (
        VALUES
            ('24h', INTERVAL '24 hours', INTERVAL '12 hours'),
            ('1h', INTERVAL '1 hour', INTERVAL '0 hours')
    ),
    due_sessions AS (
        SELECT s.session_id, s.student_id, s.coach_id, l.lead_key
        FROM public.com_t_session s
        JOIN leads l
          ON NOW() >= s.start_datetime - l.lead_from
         AND NOW() < s.start_datetime - l.lead_to
        WHERE s.status = 1
    ),
    recipients AS (
        SELECT session_id, lead_key, student_id AS user_id FROM due_sessions
        UNION
        SELECT session_id, lead_key, coach_id FROM due_sessions
    )
    INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
    SELECT r.user_id,
           'LIVE_SESSION_REMINDER',
           'REMINDER',
           r.session_id::text || ':' || r.lead_key,
           jsonb_build_object('session_id', r.session_id, 'lead', r.lead_key)
    FROM recipients r
    JOIN public.com_m_user u ON u.id = r.user_id AND u.delete_flg = '0'
    ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_live_session_reminders() FROM PUBLIC, anon, authenticated;

-- 時刻で送るメールの登録のまとめ役。時刻で送るメールの種類を増やすときは、ここに登録の関数を足す（cron のジョブは増やさない）
CREATE OR REPLACE FUNCTION public.enqueue_scheduled_mails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.enqueue_event_reminders() + public.enqueue_live_session_reminders();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_scheduled_mails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_scheduled_mails() TO service_role;

---------------------------------------------
-- invoke_mail_dispatch: メールの送信処理（admin の /api/cron/mail-dispatch）を呼び出す＋5分ごとのジョブ (2026-10-05 追加)
---------------------------------------------
-- 【方式】
-- 送信処理は Next.js（admin アプリ）の Route Handler で、メールの文面（React のテンプレート）を
-- 組み立てて Resend で送る。DB から HTTP で呼ぶため pg_net を使う（呼び出しは処理の確定後に行われる）。
-- 送信処理を呼ぶのは次の2つ（cron のジョブは1つだけで、メールの種類が増えても増やさない）。
--   1. すぐ送るメールを送信待ちに積んだ時（on_mail_outbox_inserted。通知メール等。1つの処理の中では1回だけ呼ぶ）
--   2. pg_cron の5分ごとのジョブ: 時刻で送るメールの登録（enqueue_scheduled_mails。グループセッション・ライブセッションの
--      リマインダー）の後、送る時刻が来た送信待ち
--      （チャットの10分後・失敗の再試行・取りこぼし）がある時だけ呼ぶ（invoke_mail_dispatch_if_due）
--
-- 【接続先の設定（環境ごとに1回、手作業）】
-- 送信処理のURLと秘密のキーは Supabase Vault に保存する（リポジトリには置かない）。
--   SELECT vault.create_secret('https://<admin のURL>/api/cron/mail-dispatch', 'mail_dispatch_url');
--   SELECT vault.create_secret('<admin の環境変数 CRON_SECRET と同じ値>', 'mail_dispatch_secret');
-- 変更する場合は vault.update_secret(<id>, '<新しい値>') を使う。
-- どちらかが未設定の環境（ローカルの admin しか無い dev 等）では呼び出しを行わない
-- （登録だけ行い、送信は手元から /api/cron/mail-dispatch を呼んで確認する）。
---------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION private.invoke_mail_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url text;
    v_secret text;
BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'mail_dispatch_url';
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'mail_dispatch_secret';
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION private.invoke_mail_dispatch() FROM PUBLIC, anon, authenticated;

-- 1つのトランザクションの中で送信処理を呼ぶのは1回だけにする（1つの処理で複数の通知が積まれても1回）
CREATE OR REPLACE FUNCTION private.request_mail_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_setting('gabby.mail_dispatch_requested', true) = 'on' THEN
        RETURN;
    END IF;
    PERFORM set_config('gabby.mail_dispatch_requested', 'on', true);
    PERFORM private.invoke_mail_dispatch();
END;
$$;

REVOKE EXECUTE ON FUNCTION private.request_mail_dispatch() FROM PUBLIC, anon, authenticated;

-- 送る時刻が来た送信待ち（または送信処理が止まって確保されたままの行）がある時だけ、送信処理を呼ぶ（5分ごとのジョブ用）
CREATE OR REPLACE FUNCTION private.invoke_mail_dispatch_if_due()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.com_t_mail_outbox
        WHERE (status = 'PENDING' AND scheduled_at <= NOW())
           OR (status = 'SENDING' AND locked_at < NOW() - INTERVAL '10 minutes')
    ) THEN
        PERFORM private.request_mail_dispatch();
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.invoke_mail_dispatch_if_due() FROM PUBLIC, anon, authenticated;

-- すぐ送るメール（送る時刻が来ている行）が積まれたら、処理の確定後に送信処理を呼ぶ
CREATE OR REPLACE FUNCTION private.on_mail_outbox_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM new_rows WHERE status = 'PENDING' AND scheduled_at <= NOW()) THEN
        PERFORM private.request_mail_dispatch();
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.on_mail_outbox_inserted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mail_outbox_dispatch ON public.com_t_mail_outbox;
CREATE TRIGGER trg_mail_outbox_dispatch
AFTER INSERT ON public.com_t_mail_outbox
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION private.on_mail_outbox_inserted();

-- 同名ジョブが既に存在する場合は入れ替える（何度再実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mail-dispatch-every-5min';

SELECT cron.schedule(
    'mail-dispatch-every-5min',
    '*/5 * * * *',
    $$ SELECT public.enqueue_scheduled_mails(); SELECT private.invoke_mail_dispatch_if_due(); $$
);

COMMIT;

-- =========================================================================
-- 【追加セクション】通知のリンク先の見直し（承認できる画面・対象の月を開く）
-- 追加日: 2026-10-06
--
-- 【内容】
--   アプリ内通知と通知メールで共通のリンク先（com_t_notification.link_path）を見直す。シグネチャは変更しない。
--   1. create_session_booking_request: コーチ宛ての予約申請（SESSION_BOOKING_REQUESTED）を
--      生徒詳細（/students/<id>）から、承認・却下できるカレンダー（/calendar の Pending Requests）へ
--   2. cancel_session: 生徒からの振替候補の提案（SESSION_RESCHEDULE_PROPOSED_BY_STUDENT）を /calendar へ
--      （候補なしのキャンセル SESSION_CANCELLED_BY_STUDENT は生徒詳細のまま）
--   3. approve_coach_monthly_report / revoke_coach_monthly_report_approval: 月次レポートの承認・承認取消
--      （COACH_REPORT_APPROVED / COACH_REPORT_APPROVAL_REVOKED）を、対象の月（/monthly-reports?month=YYYY-MM）へ
--   4. 登録済みの通知（上記の種別）のリンク先を同じ形に更新する（通知一覧から開いた時も同じ画面へ）
--
-- 対応ファイル: DDL/function/create_session_booking_request.sql, DDL/function/cancel_session.sql,
--   DDL/function/approve_coach_monthly_report.sql, DDL/function/revoke_coach_monthly_report_approval.sql
-- 【注意】アプリのデプロイとの前後は問わない（リンク先の画面はどちらも既存）。
-- =========================================================================

BEGIN;


---------------------------------------------
-- 未消化チケットによる新規予約リクエストRPC (2026-09-11 追加、book_makeup_sessionを置き換え)
-- 前提: table/com_m_lesson_schedule.sql, table/com_t_session.sql,
--       table/com_t_session_slot_proposal.sql, function/fn_schedule_shortfall.sql,
--       function/check_session_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- キャンセルによりticket_refunded=trueとなり未割当に戻ったチケット（週n回契約の
-- うち一部コマ）や、元々未割当のチケットを、そのコマの担当コーチ限定で予約する。
-- 旧book_makeup_session()はコーチのAvailability範囲内であれば即時確定していたが、
-- Availability制約を撤廃し自由に日時を選べるようにする代わりに、必ずコーチの承認を
-- 要するようにする（ダブルブッキング以外の「コーチの実際の都合」は承認ステップで
-- 担保する）。そのため本関数はcom_t_sessionへ直接INSERTせず、
-- com_t_session_slot_proposalへpending行を作成するのみで、確定は
-- approve_slot_proposal()が行う。
--
-- 対象コーチは com_m_lesson_schedule.coach_id で既に確定しているため、本関数は
-- コーチ選択を受け付けず、スケジュール(コマ)IDのみを受け取る。
-- shortfall(未割当チケット数)のチェックでは、既にpending中の他リクエストも
-- 暫定的に消費済みとみなし、同一コマへの過剰リクエストを防止する。
--
-- 【24時間ルール (2026-09-15追加)】
-- 生徒による個別予約は、開始24時間以内は不可（翌日以降のみ予約可能）。アドミンの
-- 代理予約(admin_book_session_direct)はこのルールの対象外（未来であればいつでも可能）。
--
-- 【権限チェック・通知の共通化について (2026-09-15追加)】
-- 通知INSERTはfn_notify()を使う（前提: function/fn_notify.sql）。権限チェックは
-- 意図的にfn_assert_actor_or_admin()を使わず素のIF文のままとする。本関数にはアドミンの
-- 代理実行を許可しない（アドミンはadmin_book_session_direct()という別の専用RPCを使う）ため。
--
-- 【通知のリンク先 (2026-10-06変更)】
-- コーチへの通知（アプリ内・メール）のリンク先は、リクエストを承認・却下できる
-- カレンダー（/calendar の Pending Requests）とする（従来の生徒詳細では承認できなかったため）。
--
-- 【スロット提案の統合 (2026-09-15追加)】
-- 書き込み先をcom_t_session_booking_requestからcom_t_session_slot_proposalへ変更する
-- （キャンセル時の振替候補(cancel_session参照)と統合した単一テーブル。詳細は
-- table/com_t_session_slot_proposal.sqlのコメント参照）。本関数が作成する行は
-- 「自由予約リクエスト」を表すため、schedule_id必須・source_session_id=NULL・
-- proposed_by_role=1(生徒)固定・expires_at=NULL(無期限)で挿入する。pending件数の
-- カウントは、同じテーブルを共有する振替候補（他のschedule_id/source_session_idを
-- 持つ行）を誤って含めないよう、source_session_id IS NULLの行のみに絞り込む
-- （振替候補はそもそも本関数のshortfallチェックの対象外という既存仕様を維持するため）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.create_session_booking_request(
    p_schedule_id uuid,
    p_start_datetime timestamptz,
    p_end_datetime timestamptz,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_shortfall integer;
    v_pending_count integer;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_request_id uuid;
    v_student_name text;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.student_id <> auth.uid() THEN
        RAISE EXCEPTION 'not authorized to request a booking for this schedule';
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'lesson schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    IF p_end_datetime <= p_start_datetime THEN
        RAISE EXCEPTION 'invalid proposed time range';
    END IF;
    IF p_start_datetime < NOW() + interval '24 hours' THEN
        RAISE EXCEPTION 'requested start datetime must be at least 24 hours from now';
    END IF;

    SELECT shortfall INTO v_shortfall FROM public.fn_schedule_shortfall(p_schedule_id);

    SELECT COUNT(*) INTO v_pending_count
    FROM public.com_t_session_slot_proposal r
    WHERE r.schedule_id = p_schedule_id AND r.status = 1 AND r.source_session_id IS NULL;

    IF v_shortfall - v_pending_count <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_schedule.coach_id, v_schedule.student_id, p_start_datetime, p_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session_slot_proposal (
        schedule_id, source_session_id, student_id, coach_id, proposed_start_datetime, proposed_end_datetime,
        proposed_by_role, status, expires_at, reason
    ) VALUES (
        p_schedule_id, NULL, v_schedule.student_id, v_schedule.coach_id, p_start_datetime, p_end_datetime,
        1, 1, NULL, NULLIF(BTRIM(p_reason), '')
    )
    RETURNING proposal_id INTO v_request_id;

    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_schedule.student_id;
    PERFORM public.fn_notify(
        v_schedule.coach_id,
        'SESSION_BOOKING_REQUESTED',
        jsonb_build_object(
            'request_id', v_request_id,
            'student_name', v_student_name,
            'requested_start_datetime', p_start_datetime
        ),
        '/calendar'
    );

    RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) TO authenticated;


---------------------------------------------
-- 個別セッションのキャンセルRPC (2026-08-15 追加, Phase3)
-- 前提: table/com_t_session.sql, table/com_t_session_slot_proposal.sql,
--       function/check_session_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- com_t_session への直接UPDATEはRLSで許可していない（SELECTのみ許可）ため、
-- 生徒・コーチいずれかによるセッションのキャンセルは必ず本関数を通す。
-- 定期スケジュール(com_m_lesson_schedule)には触れず、対象の個別回のみを
-- キャンセル済みにする（＝「定期スケジュールは基本的に維持」）。
-- チケットの消化(used_sessions)は実施完了時にのみ加算される想定のため、
-- 事前キャンセルではチケットを一切消費しない。
--
-- 【チケット返還ルール (2026-09-05追加)】
-- 生徒キャンセル: 開始12時間以上前ならticket_refunded=true（未割当扱いに戻り、
--   担当コーチ限定で再予約可能）、12時間未満ならfalse（返還なし、消化済み扱い）。
-- コーチキャンセル: 時間帯を問わず常にticket_refunded=true。
--
-- 【振替候補の提案 (2026-09-07追加、2026-09-11双方向化)】
-- 「振替」という独立概念を廃止し、個別セッションは「キャンセル」「予約」の2パターンに
-- 単純化する方針のため、キャンセル時の候補提案はコーチ→生徒・生徒→コーチの双方向で
-- 使えるようにする。p_proposed_slots は [{"start_datetime":"...","end_datetime":"..."}] 形式の
-- JSONB配列で、最大3件まで（アドミン代理キャンセル時は指定不可）。
-- Availability(com_m_coach_availability)のチェックは行わない
-- （一回限りの特別な時間として明示的に提案するものであるため）。提案時点で
-- ダブルブッキングになっていないかはcheck_session_conflict()で事前チェックする
-- （承諾時の再チェックと合わせた二段構え）。提案者はcom_t_session_slot_proposal.
-- proposed_by_roleに記録し、approve_slot_proposal/reject_slot_proposalが
-- 「提案者と逆側のみ応答可」の判定に使う。
-- 回答期限(24時間、2026-09-11に48時間から短縮)は v_proposal_validity_hours で一元管理する。
-- 今後時間数を変更したい場合はこの1箇所を書き換えるだけでよい（発行済みの提案には
-- 遡って影響しない）。
--
-- 【スロット提案の統合 (2026-09-15追加)】
-- 書き込み先をcom_t_session_reschedule_proposalからcom_t_session_slot_proposalへ変更する
-- （生徒の自由予約リクエストと統合した単一テーブル。詳細はtable/com_t_session_slot_proposal.sqlの
-- コメント参照）。本関数が作成する行は「キャンセル起因の振替候補」を表すため、
-- schedule_id=v_session.schedule_id・source_session_id=p_session_idを設定する。
--
-- 【24時間ルール (2026-09-15追加)】
-- 提案する候補の開始時刻も、生徒の個別予約と同じ「開始24時間以上先」ルールの対象とする
-- （アドミン代理キャンセルではそもそも候補提案不可のため、本ルールは常に生徒・コーチ
-- 本人の提案にのみ適用される）。検証するのは提案時点のみで、承諾側
-- (approve_slot_proposal)では再検証しない。提案の有効期限(最大24時間)の
-- 間に猶予が24時間を切ることはあり得るが、承諾側で再検証すると相手が即応答しない限り
-- 成立しない不合理なルールになるため、意図的に行わない。
--
-- 【通知 (2026-09-07追加、2026-09-11双方向化)】
-- コーチキャンセル時は生徒へ、生徒キャンセル時はコーチへ、それぞれcom_t_notificationに
-- 通知を作成する。既存の通知(TRAINING_*/CHAT_NEW_MESSAGE)と異なりトリガーではなく、
-- 本関数(SECURITY DEFINER)内で直接INSERTする（本関数自身が状態変更の唯一の発生源のため）。
-- 通知INSERTはfn_notify()を使う（前提: function/fn_notify.sql）。
--
-- 【権限チェックの共通化 (2026-09-15追加)】
-- 権限チェック自体（実際に当事者本人か／実際にアドミンか）はfn_assert_actor_or_admin()に
-- 委ねる（前提: function/fn_assert_actor_or_admin.sql）。ただし「これはアドミン代理操作か」
-- という判定は、後述の【admin-proxy判定の明示化】の通りp_as_adminで明示する。
--
-- 【admin-proxy判定の明示化 (2026-09-15追加)】
-- 従来はv_is_admin_proxyを「auth.uid()が生徒ともコーチとも一致しない」という消去法で
-- 推測していた。通常はこれで問題ないが、将来的にアドミンアカウントが同一セッションの
-- 生徒/コーチ本人を兼ねるような想定外のデータ状態が生じた場合、消去法だと誤って
-- 自己申告フロー（12時間ルール等）に流れてしまう。呼び出し元（アドミン代理操作専用の
-- cancelSessionAsAdmin）は元々「今からアドミン代理として呼ぶ」ことを認識しているため、
-- その意図をp_as_adminという明示パラメータで渡してもらい、本関数側はその申告が
-- 実際にアドミンロールを持つ呼び出し者によるものかをfn_assert_actor_or_admin(NULL, ...)で
-- 検証する、という構成に変更する。p_as_admin=falseの場合は、消去法によるアドミン救済を
-- 一切行わず、当事者本人（生徒またはコーチ）であることを厳密に要求する
-- （他の管理者専用RPC群(admin_book_session_direct等)と同じ「呼び出し方自体で意図を示す」
-- 設計思想に揃える）。
---------------------------------------------
-- 旧シグネチャからの変更のため、先に古い関数を明示的に削除する
-- （デフォルト引数を持つ新シグネチャと共存させるとPostgres側でオーバーロードの曖昧性が生じるため）。
DROP FUNCTION IF EXISTS public.cancel_session(uuid, text);
DROP FUNCTION IF EXISTS public.cancel_session(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.cancel_session(uuid, text, jsonb, boolean);

-- 【アドミン代理キャンセル対応 (2026-09-09追加、2026-09-15にp_as_admin明示化)】
-- 生徒キャンセル(1)・コーチキャンセル(2)はいずれもauth.uid()が本人と一致することを
-- 前提に返還ルール・通知内容を決めているため、管理者自身のauth.uid()（どちらとも
-- 一致しない）で呼び出すと誤判定してしまう。p_as_admin=trueを明示した場合のみ、
-- アドミン代理操作とみなし、返還可否を管理者が明示的に指定した値(p_admin_refund_ticket)で
-- そのまま確定させる（12時間ルール等は適用しない）。起因はcancel_category=3(admin)を用い、
-- 通知は生徒・コーチ双方へ、どちらが原因かを特定しない中立的な文言で送る。
--
-- 【ステータス簡素化 (2026-09-14変更)】
-- statusは常に3(cancelled)を確定し、起因（生徒/コーチ/アドミン代理）はcancel_category
-- (1/2/3)に分離する（table/com_t_session.sqlのステータス簡素化パッチ参照）。
-- 返還有無(ticket_refunded)の算出ロジック自体は変更しない。
CREATE OR REPLACE FUNCTION public.cancel_session(
    p_session_id uuid,
    p_reason text DEFAULT NULL,
    p_proposed_slots jsonb DEFAULT NULL,
    p_admin_refund_ticket boolean DEFAULT NULL,
    p_as_admin boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_cancel_category smallint;
    v_refunded boolean;
    v_is_coach boolean;
    v_is_admin_proxy boolean;
    v_coach_name text;
    v_student_name text;
    v_slot jsonb;
    v_slot_start timestamptz;
    v_slot_end timestamptz;
    v_proposed_by_role smallint;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_proposal_count integer := 0;
    v_proposal_validity_hours CONSTANT integer := 24; -- 変更する場合はここを直接編集すること
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    v_is_admin_proxy := p_as_admin;

    IF v_is_admin_proxy THEN
        -- p_as_admin=trueを名乗った場合、実際にアドミンロールであることを検証する
        -- （当事者本人と一致するかどうかは問わない）
        PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to cancel this session');
    ELSE
        -- p_as_admin=falseの場合は、消去法によるアドミン救済を行わず、当事者本人
        -- （生徒またはコーチ）であることを厳密に要求する
        IF auth.uid() IS DISTINCT FROM v_session.student_id AND auth.uid() IS DISTINCT FROM v_session.coach_id THEN
            RAISE EXCEPTION 'not authorized to cancel this session';
        END IF;
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime <= NOW() THEN
        RAISE EXCEPTION 'cannot cancel a session that has already started';
    END IF;

    v_is_coach := (v_session.coach_id = auth.uid());

    IF v_is_admin_proxy THEN
        IF p_admin_refund_ticket IS NULL THEN
            RAISE EXCEPTION 'p_admin_refund_ticket is required for an admin-initiated cancellation';
        END IF;
        v_cancel_category := 3; -- admin
        v_refunded := p_admin_refund_ticket;
    ELSIF v_session.student_id = auth.uid() THEN
        v_cancel_category := 1; -- student
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_cancel_category := 2; -- coach
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = 3, cancel_category = v_cancel_category, cancel_reason = p_reason, cancelled_by = auth.uid(),
        ticket_refunded = v_refunded, update_date = NOW()
    WHERE session_id = p_session_id;

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_session.coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_session.student_id;

    -- 候補提案（コーチ・生徒いずれのキャンセルでも共通。アドミン代理操作では提案不可）
    IF NOT v_is_admin_proxy AND p_proposed_slots IS NOT NULL THEN
        v_proposed_by_role := CASE WHEN v_is_coach THEN 2 ELSE 1 END;
        v_proposal_count := jsonb_array_length(p_proposed_slots);
        IF v_proposal_count > 3 THEN
            RAISE EXCEPTION 'cannot propose more than 3 alternative times';
        END IF;

        FOR v_slot IN SELECT * FROM jsonb_array_elements(p_proposed_slots) LOOP
            v_slot_start := (v_slot->>'start_datetime')::timestamptz;
            v_slot_end := (v_slot->>'end_datetime')::timestamptz;

            IF v_slot_start < NOW() + interval '24 hours' THEN
                RAISE EXCEPTION 'proposed time must be at least 24 hours from now';
            END IF;
            IF v_slot_end <= v_slot_start THEN
                RAISE EXCEPTION 'invalid proposed time range';
            END IF;

            SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
            FROM public.check_session_conflict(v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end, p_session_id);
            IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
            IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

            INSERT INTO public.com_t_session_slot_proposal (
                schedule_id, source_session_id, coach_id, student_id, proposed_start_datetime, proposed_end_datetime,
                proposed_by_role, status, expires_at
            ) VALUES (
                v_session.schedule_id, p_session_id, v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end,
                v_proposed_by_role, 1, NOW() + (v_proposal_validity_hours || ' hours')::interval
            );
        END LOOP;
    END IF;

    IF v_is_admin_proxy THEN
        PERFORM public.fn_notify(v_session.student_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/live-room');
        PERFORM public.fn_notify(v_session.coach_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/students/' || v_session.student_id);
    ELSIF v_is_coach THEN
        PERFORM public.fn_notify(
            v_session.student_id,
            CASE WHEN v_proposal_count > 0 THEN 'SESSION_RESCHEDULE_PROPOSED' ELSE 'SESSION_CANCELLED_BY_COACH' END,
            jsonb_build_object(
                'session_id', p_session_id,
                'coach_name', v_coach_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', v_proposal_count
            ),
            '/live-room'
        );
    ELSE
        PERFORM public.fn_notify(
            v_session.coach_id,
            CASE WHEN v_proposal_count > 0 THEN 'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT' ELSE 'SESSION_CANCELLED_BY_STUDENT' END,
            jsonb_build_object(
                'session_id', p_session_id,
                'student_name', v_student_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', v_proposal_count
            ),
            -- 振替候補の提案はコーチが承認・却下するため、承認できるカレンダー（Pending Requests）へ (2026-10-06変更)
            CASE WHEN v_proposal_count > 0 THEN '/calendar' ELSE '/students/' || v_session.student_id END
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean, boolean) TO authenticated;


---------------------------------------------
-- 月次コーチングレポート承認RPC (2026-09-13 追加)
-- 前提: table/com_t_coach_monthly_report_approval.sql, function/get_coach_monthly_sessions.sql,
--       table/com_m_session_pay_rate.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- アドミンが対象コーチ・対象月の稼働を確認した上で承認する。コーチからの申請フローは無く、
-- アドミンの一方的な操作のみで確定する。承認時点のセッション集計（get_coach_monthly_sessionsの
-- counts_toward_totalを生徒別に集計したもの）をJSONBスナップショットとして固定保存し、
-- 事後のデータ変動（終了処理漏れの遅延解決等）から承認済み表示を保護する。
--
-- 【呼び出し元】
-- apps/adminはcreateAdminClient()(service_role)経由で呼ぶため、本関数内でauth.uid()は
-- 取得できない（NULLになる）。そのため承認者IDはp_approved_byとして明示的に受け取る
-- （adminContractAction.tsのperformed_by: resolvePerformedBy(ctx.userId)と同じ理由）。
--
-- 【終了処理未実施セッションの承認ブロック (2026-09-13 追加)】
-- 終了処理未実施(is_unresolved=true)のセッションが1件でも残っている月は、実績が確定して
-- いない（completed/no_show等に確定していない）とみなし、承認自体を拒否する。
-- 画面側（apps/admin ApprovalControlBar）でも同条件で承認ボタンを無効化しているが、
-- 画面表示後にコーチ側の操作で状態が変わる競合を防ぐため、本RPC側でも同じ判定を行う
-- （フロント側のチェックはUXのため、こちらが正の防御線）。
--
-- 【支払通知書PDF向け単価スナップショット (2026-09-13 追加)】
-- コーチ向け月次支払通知書(PDF)の支払額(単価×総セッション数)を、承認後の単価マスタ改定
-- から保護するため、承認時点のcom_m_session_pay_rateの値をrate_amount/rate_currencyへ
-- 固定保存する。単価マスタは管理者のみ参照可能（RLS）だが、本関数はSECURITY DEFINERの
-- ためRLSを経由せず直接参照できる。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_coach_monthly_report(
    p_coach_id uuid,
    p_report_month date,
    p_approved_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month date := date_trunc('month', p_report_month)::date;
    v_snapshot jsonb;
    v_unresolved_count integer;
    v_rate_amount numeric(10, 2);
    v_rate_currency text;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to approve this monthly report';
    END IF;

    SELECT COUNT(*) INTO v_unresolved_count
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month) s
    WHERE s.is_unresolved;

    IF v_unresolved_count > 0 THEN
        RAISE EXCEPTION 'cannot approve while % unresolved session(s) remain for this month', v_unresolved_count;
    END IF;

    SELECT jsonb_build_object(
        'total', COALESCE(SUM((counts_toward_total)::int), 0),
        'by_student', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('student_id', student_id, 'count', cnt))
             FROM (
                 SELECT student_id, SUM((counts_toward_total)::int) AS cnt
                 FROM public.get_coach_monthly_sessions(p_coach_id, v_month)
                 GROUP BY student_id
             ) per_student),
            '[]'::jsonb
        )
    )
    INTO v_snapshot
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month);

    SELECT rate_amount, currency_code INTO v_rate_amount, v_rate_currency
    FROM public.com_m_session_pay_rate
    ORDER BY update_date DESC
    LIMIT 1;

    INSERT INTO public.com_t_coach_monthly_report_approval (
        coach_id, report_month, status, session_count_snapshot, rate_amount, rate_currency, approved_by, approved_at, update_date
    ) VALUES (
        p_coach_id, v_month, 2, v_snapshot, v_rate_amount, v_rate_currency, p_approved_by, NOW(), NOW()
    )
    ON CONFLICT (coach_id, report_month) DO UPDATE
    SET status = 2,
        session_count_snapshot = v_snapshot,
        rate_amount = v_rate_amount,
        rate_currency = v_rate_currency,
        approved_by = p_approved_by,
        approved_at = NOW(),
        update_date = NOW();

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        p_coach_id,
        'COACH_REPORT_APPROVED',
        jsonb_build_object('report_month', v_month),
        -- 対象の月を開く（月の指定が無いと今月が開くため。2026-10-06変更）
        '/monthly-reports?month=' || to_char(v_month, 'YYYY-MM')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) TO authenticated;


---------------------------------------------
-- 月次コーチングレポート承認取消しRPC (2026-09-13 追加)
-- 前提: table/com_t_coach_monthly_report_approval.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- アドミンが承認後に誤りへ気付いた場合に、承認を取り消して未承認状態へ戻す。
-- コーチへの差し戻し（再申請を促す）フローではなく、単純な承認取消しのみ。
-- 取消し後は再度approve_coach_monthly_reportで承認し直すことを想定するため、
-- 承認時点のスナップショット（セッション集計・単価とも）はNULLへ戻す
-- （再承認時に最新値で作り直される）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_coach_monthly_report_approval(
    p_coach_id uuid,
    p_report_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month date := date_trunc('month', p_report_month)::date;
    v_approval RECORD;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to revoke this monthly report approval';
    END IF;

    SELECT * INTO v_approval
    FROM public.com_t_coach_monthly_report_approval
    WHERE coach_id = p_coach_id AND report_month = v_month
    FOR UPDATE;

    IF NOT FOUND OR v_approval.status <> 2 THEN
        RAISE EXCEPTION 'this monthly report is not approved';
    END IF;

    UPDATE public.com_t_coach_monthly_report_approval
    SET status = 1,
        session_count_snapshot = NULL,
        rate_amount = NULL,
        rate_currency = NULL,
        approved_by = NULL,
        approved_at = NULL,
        update_date = NOW()
    WHERE coach_id = p_coach_id AND report_month = v_month;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        p_coach_id,
        'COACH_REPORT_APPROVAL_REVOKED',
        jsonb_build_object('report_month', v_month),
        -- 対象の月を開く（月の指定が無いと今月が開くため。2026-10-06変更）
        '/monthly-reports?month=' || to_char(v_month, 'YYYY-MM')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_coach_monthly_report_approval(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_coach_monthly_report_approval(uuid, date) TO authenticated;

-- 登録済みの通知のリンク先を、上記の関数と同じ形に更新する（何度再実行しても同じ結果）
UPDATE public.com_t_notification
SET link_path = '/calendar',
    update_date = NOW()
WHERE notification_type IN ('SESSION_BOOKING_REQUESTED', 'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT')
  AND link_path IS DISTINCT FROM '/calendar';

UPDATE public.com_t_notification
SET link_path = '/monthly-reports?month=' || LEFT(payload->>'report_month', 7),
    update_date = NOW()
WHERE notification_type IN ('COACH_REPORT_APPROVED', 'COACH_REPORT_APPROVAL_REVOKED')
  AND payload->>'report_month' IS NOT NULL
  AND link_path = '/monthly-reports';

COMMIT;

-- =========================================================================
-- 【追加セクション】メール基盤の改善（到達状況の記録・送信履歴の保管期限）
-- 追加日: 2026-10-06
--
-- 【内容】
--   1. com_t_mail_outbox に到達状況（delivery_status / delivery_detail / delivery_updated_at）と、
--      メッセージIDの索引を追加
--   2. com_t_mail_event（到達状況の出来事。Resend の Webhook。招待・パスワード再設定を含む）を新規作成
--   3. record_mail_event()（出来事の記録・送信待ちの到達状況の更新・迷惑メールの報告で区分の配信停止）を新規作成
--   4. private.purge_mail_history()（送り終えた送信待ち・出来事を180日で削除）と、pg_cron の毎日のジョブ
--      'mail-history-purge-daily'（03:30 JST）を作成
--
-- 対応ファイル: DDL/table/com_t_mail_outbox.sql, DDL/table/com_t_mail_event.sql,
--   DDL/function/record_mail_event.sql, DDL/function/purge_mail_history.sql
-- 【注意】第2セクション（メール基盤）の後に適用すること。admin の Webhook の受け口（/api/webhooks/resend）が 2・3 を使うため、
--   アプリのデプロイより先に適用すること。
-- 【適用後の手作業（staging・prod。環境ごとに1回）】
--   a. Resend の Webhooks で、エンドポイント https://<admin のURL>/api/webhooks/resend を追加する
--      （イベント: email.sent / email.delivered / email.delivery_delayed / email.bounced / email.complained /
--      email.failed / email.suppressed）。表示された Signing Secret を admin の環境変数 RESEND_WEBHOOK_SECRET に設定して再デプロイする
--   b. admin の環境変数 MAIL_DISPATCH_MODE を設定して再デプロイする（本番 "all"、staging "allowlist"）。
--      未設定のままでは通知・リマインダーのメールが送られない（送信待ちに残り、設定後に送る。積んでから24時間を過ぎた通知は送らない）
--   dev は Resend の Webhook を登録しない（ローカルの admin には Resend から届かないため）。
-- =========================================================================

BEGIN;


ALTER TABLE public.com_t_mail_outbox
    ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS delivery_detail TEXT,
    ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.com_t_mail_outbox DROP CONSTRAINT IF EXISTS chk_mail_outbox_delivery_status;
ALTER TABLE public.com_t_mail_outbox
    ADD CONSTRAINT chk_mail_outbox_delivery_status
    CHECK (delivery_status IN ('DELAYED', 'DELIVERED', 'BOUNCED', 'FAILED', 'SUPPRESSED', 'COMPLAINED'));

COMMENT ON COLUMN public.com_t_mail_outbox.delivery_status IS '到達状況 (Resend の Webhook。DELAYED: 遅延 / DELIVERED: 到達 / BOUNCED: 不達 / FAILED: 送信失敗 / SUPPRESSED: 送信停止中の宛先 / COMPLAINED: 迷惑メールの報告)';
COMMENT ON COLUMN public.com_t_mail_outbox.delivery_detail IS '到達状況の詳細（不達の理由等）';
COMMENT ON COLUMN public.com_t_mail_outbox.delivery_updated_at IS '到達状況の更新日時';

CREATE INDEX IF NOT EXISTS idx_mail_outbox_provider_message ON public.com_t_mail_outbox (provider_message_id) WHERE provider_message_id IS NOT NULL;


---------------------------------------------
-- DDL: com_t_mail_event (メールの到達状況の出来事) (2026-10-06 追加)
---------------------------------------------
-- 【背景】
-- Resend の Webhook（admin の /api/webhooks/resend）で届く出来事（送信・到達・遅延・不達・迷惑メールの報告等）を記録する。
-- 送信待ち（com_t_mail_outbox）を通らない招待・パスワード再設定のメールも記録するため、
-- 「メールが届かない」という問い合わせを、宛先のアドレスで調べられる。
-- 送信待ちを通ったメールは、mail_id（送信時に Resend のタグで付けた送信待ちの行）で送信待ちの行と結び付き、
-- record_mail_event が送信待ちの行の到達状況（delivery_status）も更新する。
--
-- 【重複】
-- Webhook は同じ出来事を再送しうるため、webhook_id（Resend の svix-id ヘッダー）で一意にする。
--
-- 【保管期限】
-- 送信待ちと同じく、purge_mail_history（pg_cron の毎日のジョブ）が一定期間を過ぎた行を消す。
--
-- 生徒・コーチ・管理者の画面からは参照しない（RLSを有効にしてポリシーを作らない＝service_roleのみ）。
---------------------------------------------
CREATE TABLE public.com_t_mail_event (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id VARCHAR(100) NOT NULL UNIQUE,
    event_type VARCHAR(40) NOT NULL,
    provider_message_id VARCHAR(100) NOT NULL,
    mail_id UUID,
    mail_kind VARCHAR(50),
    recipient TEXT,
    subject TEXT,
    detail TEXT,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_mail_event IS 'メールの到達状況の出来事（Resend の Webhook。招待・パスワード再設定を含むすべてのメール）';
COMMENT ON COLUMN public.com_t_mail_event.event_id IS '出来事ID';
COMMENT ON COLUMN public.com_t_mail_event.webhook_id IS 'Webhook の配信ID（svix-id。同じ出来事の再送を1件にする）';
COMMENT ON COLUMN public.com_t_mail_event.event_type IS '出来事の種類 (email.sent / email.delivered / email.delivery_delayed / email.bounced / email.complained / email.failed / email.suppressed)';
COMMENT ON COLUMN public.com_t_mail_event.provider_message_id IS '送信サービス(Resend)のメッセージID';
COMMENT ON COLUMN public.com_t_mail_event.mail_id IS '送信待ちの行 (com_t_mail_outbox.mail_id。送信待ちを通らないメールは NULL。送信待ちの行が消えても残すため外部キーにしない)';
COMMENT ON COLUMN public.com_t_mail_event.mail_kind IS 'メールの種類（送信時の Resend のタグ kind。例: account_invite_student / password_reset / NOTIFICATION）';
COMMENT ON COLUMN public.com_t_mail_event.recipient IS '宛先のメールアドレス';
COMMENT ON COLUMN public.com_t_mail_event.subject IS '件名';
COMMENT ON COLUMN public.com_t_mail_event.detail IS '詳細（不達・送信失敗の理由等）';
COMMENT ON COLUMN public.com_t_mail_event.occurred_at IS '出来事の日時（Resend が記録した日時）';
COMMENT ON COLUMN public.com_t_mail_event.insert_date IS '登録日時';

CREATE INDEX idx_mail_event_message ON public.com_t_mail_event (provider_message_id);
CREATE INDEX idx_mail_event_recipient ON public.com_t_mail_event (lower(recipient), occurred_at DESC);
CREATE INDEX idx_mail_event_occurred ON public.com_t_mail_event (occurred_at DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
-- ポリシーを作らない（service_role の Webhook の受け口と SECURITY DEFINER 関数だけが読み書きする）
---------------------------------------------
ALTER TABLE public.com_t_mail_event ENABLE ROW LEVEL SECURITY;


---------------------------------------------
-- record_mail_event: メールの到達状況の出来事を記録する (2026-10-06 追加)
---------------------------------------------
-- 前提: table/com_t_mail_event.sql, table/com_t_mail_outbox.sql, table/com_t_user_mail_setting.sql の作成が完了していること。
-- 呼び出し元: admin の /api/webhooks/resend（Resend の Webhook。署名を確かめたうえで service_role で呼ぶ）
--
-- 1. 出来事を com_t_mail_event に登録する（同じ webhook_id の再送は何もしない）
-- 2. 送信待ちを通ったメール（mail_id、無ければ provider_message_id で特定）は、送信待ちの行の到達状況を更新する。
--    出来事は順不同で届くため、より重い状況で上書きされないようにする
--    （遅延 < 到達 < 不達・送信失敗・送信停止中の宛先 < 迷惑メールの報告。email.sent は到達状況を変えない）
-- 3. 迷惑メールの報告（email.complained）は、そのメールの区分（通知・リマインダー）の配信を停止する
--    （報告が続くと送信元ドメインの評価が下がるため。プロフィールの「メール通知」から再開できる）
-- 戻り値: 新たに記録した場合は TRUE（再送で既に記録済みなら FALSE）
---------------------------------------------
-- 到達状況の重さ（未記録 0 < 遅延 1 < 到達 2 < 不達・送信失敗・送信停止中の宛先 3 < 迷惑メールの報告 4）
CREATE OR REPLACE FUNCTION public.fn_mail_delivery_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_status
        WHEN 'DELAYED' THEN 1
        WHEN 'DELIVERED' THEN 2
        WHEN 'BOUNCED' THEN 3
        WHEN 'FAILED' THEN 3
        WHEN 'SUPPRESSED' THEN 3
        WHEN 'COMPLAINED' THEN 4
        ELSE 0
    END;
$$;

DROP FUNCTION IF EXISTS public.record_mail_event(text, text, text, uuid, text, text, text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.record_mail_event(
    p_webhook_id text,
    p_event_type text,
    p_provider_message_id text,
    p_mail_id uuid,
    p_mail_kind text,
    p_recipient text,
    p_subject text,
    p_detail text,
    p_occurred_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status text;
    v_outbox public.com_t_mail_outbox%ROWTYPE;
BEGIN
    INSERT INTO public.com_t_mail_event (
        webhook_id, event_type, provider_message_id, mail_id, mail_kind, recipient, subject, detail, occurred_at
    )
    VALUES (
        p_webhook_id, p_event_type, p_provider_message_id, p_mail_id, p_mail_kind, p_recipient, p_subject, p_detail, p_occurred_at
    )
    ON CONFLICT (webhook_id) DO NOTHING;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    v_status := CASE p_event_type
        WHEN 'email.delivery_delayed' THEN 'DELAYED'
        WHEN 'email.delivered' THEN 'DELIVERED'
        WHEN 'email.bounced' THEN 'BOUNCED'
        WHEN 'email.failed' THEN 'FAILED'
        WHEN 'email.suppressed' THEN 'SUPPRESSED'
        WHEN 'email.complained' THEN 'COMPLAINED'
    END;
    IF v_status IS NULL THEN
        RETURN TRUE;
    END IF;

    SELECT * INTO v_outbox
    FROM public.com_t_mail_outbox
    WHERE (p_mail_id IS NOT NULL AND mail_id = p_mail_id)
       OR (p_mail_id IS NULL AND provider_message_id = p_provider_message_id)
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN TRUE;
    END IF;

    IF public.fn_mail_delivery_rank(v_status) >= public.fn_mail_delivery_rank(v_outbox.delivery_status) THEN
        UPDATE public.com_t_mail_outbox
        SET delivery_status = v_status,
            delivery_detail = p_detail,
            delivery_updated_at = NOW(),
            provider_message_id = COALESCE(provider_message_id, p_provider_message_id),
            update_date = NOW()
        WHERE mail_id = v_outbox.mail_id;
    END IF;

    IF v_status = 'COMPLAINED' THEN
        INSERT INTO public.com_t_user_mail_setting (user_id, category, enabled)
        VALUES (v_outbox.user_id, v_outbox.category, FALSE)
        ON CONFLICT (user_id, category) DO UPDATE SET enabled = FALSE, update_date = NOW();
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_mail_event(text, text, text, uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_mail_event(text, text, text, uuid, text, text, text, text, timestamptz) TO service_role;


---------------------------------------------
-- purge_mail_history: メールの送信履歴・到達状況の保管期限 (2026-10-06 追加)
---------------------------------------------
-- 前提: table/com_t_mail_outbox.sql, table/com_t_mail_event.sql の作成が完了していること。
-- 送信待ち（com_t_mail_outbox）の送り終えた行（SENT / SKIPPED / FAILED）と、到達状況の出来事（com_t_mail_event）のうち、
-- 登録から p_retention_days 日を過ぎたものを消す（送信待ち・確保中の行は消さない）。
-- 問い合わせの調査に使う期間として180日残す。pg_cron の毎日のジョブ 'mail-history-purge-daily'（03:30 JST）から呼ぶ。
-- 戻り値: 消した行の数（送信待ち＋出来事）
---------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION private.purge_mail_history(p_retention_days integer DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_outbox integer;
    v_event integer;
BEGIN
    DELETE FROM public.com_t_mail_outbox
    WHERE status IN ('SENT', 'SKIPPED', 'FAILED')
      AND insert_date < NOW() - make_interval(days => p_retention_days);
    GET DIAGNOSTICS v_outbox = ROW_COUNT;

    DELETE FROM public.com_t_mail_event
    WHERE insert_date < NOW() - make_interval(days => p_retention_days);
    GET DIAGNOSTICS v_event = ROW_COUNT;

    RETURN v_outbox + v_event;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.purge_mail_history(integer) FROM PUBLIC, anon, authenticated;

-- 同名ジョブが既に存在する場合は入れ替える（何度再実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mail-history-purge-daily';

SELECT cron.schedule(
    'mail-history-purge-daily',
    '30 18 * * *',
    $$ SELECT private.purge_mail_history(); $$
);

COMMIT;

-- =========================================================================
-- 【追加セクション】運営向けのメール配信の日次の要約
-- 追加日: 2026-10-06
--
-- 【内容】
--   1. private.invoke_mail_dispatch に送信処理へ渡す JSON の引数（p_body、既定は {}）を追加（旧シグネチャは削除）
--   2. pg_cron の毎日のジョブ 'mail-daily-report'（09:00 JST）を作成。送信処理を task=daily_report で呼び、
--      直近24時間の送信失敗・不達・迷惑メールの報告・送信待ちの滞留があれば、運営のアドレス（admin の MAIL_OPS_ALERT_TO）へ要約を送る
--   （DDL/function/invoke_mail_dispatch.sql を再適用。'mail-dispatch-every-5min' は入れ替わるだけで内容は同じ）
--
-- 対応ファイル: DDL/function/invoke_mail_dispatch.sql
-- 【注意】第7セクション（到達状況の記録）の後に適用すること。アプリ（task=daily_report を受け付ける送信処理）のデプロイ前に
--   ジョブが動いた場合は、通常の送信処理として扱われる（害はない）。
-- 【適用後の手作業（staging・prod）】
--   admin の環境変数 MAIL_OPS_ALERT_TO に運営のアドレスを設定して再デプロイする（未設定なら要約は送らない）。
-- =========================================================================

BEGIN;


---------------------------------------------
-- invoke_mail_dispatch: メールの送信処理（admin の /api/cron/mail-dispatch）を呼び出す＋5分ごとのジョブ (2026-10-05 追加)
---------------------------------------------
-- 【方式】
-- 送信処理は Next.js（admin アプリ）の Route Handler で、メールの文面（React のテンプレート）を
-- 組み立てて Resend で送る。DB から HTTP で呼ぶため pg_net を使う（呼び出しは処理の確定後に行われる）。
-- 送信処理を呼ぶのは次の2つ（送信の cron のジョブは1つだけで、メールの種類が増えても増やさない）。
--   1. すぐ送るメールを送信待ちに積んだ時（on_mail_outbox_inserted。通知メール等。1つの処理の中では1回だけ呼ぶ）
--   2. pg_cron の5分ごとのジョブ: 時刻で送るメールの登録（enqueue_scheduled_mails。グループセッション・ライブセッションの
--      リマインダー）の後、送る時刻が来た送信待ち
--      （チャットの10分後・失敗の再試行・取りこぼし）がある時だけ呼ぶ（invoke_mail_dispatch_if_due）
-- 別に、pg_cron の毎日のジョブ 'mail-daily-report'（09:00 JST）が、運営向けのメール配信の日次の要約を
-- task=daily_report で呼ぶ（2026-10-06 追加。送る相手は admin の環境変数 MAIL_OPS_ALERT_TO。問題が無い日も「異常なし」で毎日送り、届くこと自体を送信処理の生存確認にする）。
--
-- 【接続先の設定（環境ごとに1回、手作業）】
-- 送信処理のURLと秘密のキーは Supabase Vault に保存する（リポジトリには置かない）。
--   SELECT vault.create_secret('https://<admin のURL>/api/cron/mail-dispatch', 'mail_dispatch_url');
--   SELECT vault.create_secret('<admin の環境変数 CRON_SECRET と同じ値>', 'mail_dispatch_secret');
-- 変更する場合は vault.update_secret(<id>, '<新しい値>') を使う。
-- どちらかが未設定の環境（ローカルの admin しか無い dev 等）では呼び出しを行わない
-- （登録だけ行い、送信は手元から /api/cron/mail-dispatch を呼んで確認する）。
---------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- p_body: 送信処理に渡す JSON（{"task":"daily_report"} で日次の要約。既定は送信処理）(2026-10-06 引数を追加)
DROP FUNCTION IF EXISTS private.invoke_mail_dispatch();

CREATE OR REPLACE FUNCTION private.invoke_mail_dispatch(p_body jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url text;
    v_secret text;
BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'mail_dispatch_url';
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'mail_dispatch_secret';
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
        body := p_body,
        timeout_milliseconds := 60000
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION private.invoke_mail_dispatch(jsonb) FROM PUBLIC, anon, authenticated;

-- 1つのトランザクションの中で送信処理を呼ぶのは1回だけにする（1つの処理で複数の通知が積まれても1回）
CREATE OR REPLACE FUNCTION private.request_mail_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_setting('gabby.mail_dispatch_requested', true) = 'on' THEN
        RETURN;
    END IF;
    PERFORM set_config('gabby.mail_dispatch_requested', 'on', true);
    PERFORM private.invoke_mail_dispatch();
END;
$$;

REVOKE EXECUTE ON FUNCTION private.request_mail_dispatch() FROM PUBLIC, anon, authenticated;

-- 送る時刻が来た送信待ち（または送信処理が止まって確保されたままの行）がある時だけ、送信処理を呼ぶ（5分ごとのジョブ用）
CREATE OR REPLACE FUNCTION private.invoke_mail_dispatch_if_due()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.com_t_mail_outbox
        WHERE (status = 'PENDING' AND scheduled_at <= NOW())
           OR (status = 'SENDING' AND locked_at < NOW() - INTERVAL '10 minutes')
    ) THEN
        PERFORM private.request_mail_dispatch();
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.invoke_mail_dispatch_if_due() FROM PUBLIC, anon, authenticated;

-- すぐ送るメール（送る時刻が来ている行）が積まれたら、処理の確定後に送信処理を呼ぶ
CREATE OR REPLACE FUNCTION private.on_mail_outbox_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM new_rows WHERE status = 'PENDING' AND scheduled_at <= NOW()) THEN
        PERFORM private.request_mail_dispatch();
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.on_mail_outbox_inserted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mail_outbox_dispatch ON public.com_t_mail_outbox;
CREATE TRIGGER trg_mail_outbox_dispatch
AFTER INSERT ON public.com_t_mail_outbox
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION private.on_mail_outbox_inserted();

-- 同名ジョブが既に存在する場合は入れ替える（何度再実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mail-dispatch-every-5min';

SELECT cron.schedule(
    'mail-dispatch-every-5min',
    '*/5 * * * *',
    $$ SELECT public.enqueue_scheduled_mails(); SELECT private.invoke_mail_dispatch_if_due(); $$
);

-- 運営向けのメール配信の日次の要約（毎日 09:00 JST。問題が無い日も送る。宛先が未設定の環境では送信処理が送らない）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mail-daily-report';

SELECT cron.schedule(
    'mail-daily-report',
    '0 0 * * *',
    $$ SELECT private.invoke_mail_dispatch('{"task":"daily_report"}'::jsonb); $$
);

COMMIT;
