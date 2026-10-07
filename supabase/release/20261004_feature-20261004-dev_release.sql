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
--   | admin                 | MAIL_OPS_ALERT_TO                 | 運営向けのメール配信の日次の要約の宛先（カンマ区切り。毎日 09:00 JST に送る。
--   |                       |                                   | 問題が無い日も「異常なし」で送り、届くこと自体を送信処理の生存確認にする。未設定なら送らない。staging は運営の社内アドレス、または設定しない）
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

-- =========================================================================
-- 【追加セクション】スプリントの実施履歴（answered_history）が配列であることを保証する
-- 追加日: 2026-10-06
--
-- 【内容】
--   1. self_t_sprint / lesson_t_sprint の answered_history に、JSON 文字列として保存された行があれば配列に直す
--      （アプリは配列で保存しており dev には該当行なし。古いデータの保険）
--   2. 両テーブルの answered_history に CHECK 制約（配列であること）を追加する
--   - 要素の形（question_id・seq_no 等）はアプリの保存処理で検証する（packages/lib/sprint/answeredHistory.ts）。
--   - 適用はアプリのデプロイより先に行う（アプリは文字列の answered_history を読まなくなるため）。
--   - 既存のアプリは配列で保存しているため、デプロイ前に適用しても保存には影響しない。
-- =========================================================================

BEGIN;

UPDATE public.self_t_sprint
SET answered_history = (answered_history #>> '{}')::jsonb
WHERE jsonb_typeof(answered_history) = 'string';

UPDATE public.lesson_t_sprint
SET answered_history = (answered_history #>> '{}')::jsonb
WHERE jsonb_typeof(answered_history) = 'string';

ALTER TABLE public.self_t_sprint DROP CONSTRAINT IF EXISTS self_t_sprint_answered_history_is_array;
ALTER TABLE public.self_t_sprint
  ADD CONSTRAINT self_t_sprint_answered_history_is_array CHECK (jsonb_typeof(answered_history) = 'array');

ALTER TABLE public.lesson_t_sprint DROP CONSTRAINT IF EXISTS lesson_t_sprint_answered_history_is_array;
ALTER TABLE public.lesson_t_sprint
  ADD CONSTRAINT lesson_t_sprint_answered_history_is_array CHECK (jsonb_typeof(answered_history) = 'array');

COMMIT;

-- =========================================================================
-- 【追加セクション】スプリントの実施履歴（self_t_sprint.answered_history）の列コメントに要素の項目を記載する
-- 追加日: 2026-10-06
--
-- 【内容】
--   1. self_t_sprint.answered_history の列コメントを、lesson_t_sprint と同じく要素の項目まで書く形にそろえる
--   - コメントの変更のみ。アプリのデプロイとの前後は問わない。
-- =========================================================================

BEGIN;

COMMENT ON COLUMN public.self_t_sprint.answered_history IS '実施問題の履歴情報(JSON配列。出題順): question_id, group_id, seq_no, is_skipped, assessment(発話評価。未評価はnull: total_score(0-100), analysis(結果画面のフィードバック用の詳細。古い記録には無い))。2026-06以前の記録には is_skipped・group_id・seq_no が無い要素がある';

COMMIT;

-- =========================================================================
-- 【追加セクション】通知メールに対象の日時を載せる（否認の通知に申請のIDを含める）
-- 追加日: 2026-10-06
--
-- 【内容】
--   予約・キャンセル・マッチングの通知メールに、対象の日時・振替候補・否認理由を載せる（文面はアプリ側で組み立てる）。
--   送信処理が送る直前に申請の行を読めるよう、否認の通知の payload に申請のIDを足す。シグネチャは変更しない。
--   1. reject_matching_request: MATCHING_REJECTED の payload に request_id を追加（申請した曜日・時間と否認理由を読む）
--   2. reject_slot_proposal: SESSION_BOOKING_REJECTED の payload に proposal_id を追加（申請した日時の終了時刻を読む）
--   - 適用前に登録された通知は ID が無いため、メールは payload の情報だけで送る（日時の無い文面になる場合がある）。
--
-- 対応ファイル: DDL/function/reject_matching_request.sql, DDL/function/reject_slot_proposal.sql
-- 【注意】アプリのデプロイとの前後は問わない（ID が無い通知はアプリ側で従来どおりに送る）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- マッチングリクエスト否認RPC (2026-08-15 追加)
-- 前提: table/com_t_matching_request.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチがマッチングリクエストを否認する唯一の入口。否認理由の入力を必須とする。
-- com_t_matching_request への直接UPDATEはRLSで許可していないため、必ず本関数を通す。
--
-- 【通知 (2026-09-09追加)】
-- 否認完了時、生徒へ通知する(MATCHING_REJECTED)。否認理由(p_reason)はコーチが
-- 生徒への配慮なく入力する場合もあるため、通知本文にはそのまま転記せず、
-- 柔らかい定型文のみとする（理由の詳細は生徒がアプリ側の変更履歴等で別途確認する想定）。
--
-- 【通知メールに申請の内容を載せる (2026-10-06追加)】
-- 通知メールには、申請した曜日・時間と否認理由を載せる（理由は生徒のマッチング画面でも「前回否認理由」として表示済み）。
-- 送信処理が送る直前に申請の行を読めるよう、payload に request_id を含める（アプリ内の通知の文面は定型文のまま）。
--
-- 【権限チェック・通知の共通化 (2026-09-15追加)】
-- 権限チェックはfn_assert_actor_or_admin()、通知INSERTはfn_notify()を使う
-- （前提: function/fn_assert_actor_or_admin.sql, function/fn_notify.sql）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_matching_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_coach_name text;
BEGIN
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'reject_reason is required';
    END IF;

    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to reject this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 3, reject_reason = p_reason, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_REJECTED',
        jsonb_build_object('coach_name', v_coach_name, 'request_id', p_request_id),
        '/coach-matching'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_matching_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_matching_request(uuid, text) TO authenticated;

---------------------------------------------
-- 候補提案の却下/取り下げ応答RPC (2026-09-15 追加、reject_session_booking_request/
-- decline_session_reschedule_proposalsを統合)
-- 前提: table/com_t_session_slot_proposal.sql, function/fn_assert_actor_or_admin.sql の
--       作成が完了していること。
---------------------------------------------
-- 【背景】
-- 「応答する側が候補を却下する」処理を、approve_slot_proposal()と対になる形で統合する。
-- ただし却下の粒度は振替候補と自由予約リクエストで異なる（旧仕様をそのまま踏襲する）。
--   - 振替候補(source_session_id IS NOT NULL): 同一キャンセルに紐づくpendingな候補は
--     「いずれか1つを選ぶ」ための選択肢であり、個別に却下する意味が薄いため、
--     旧decline_session_reschedule_proposalsと同様にまとめて却下する。通知は行わない
--     （旧仕様のまま）。
--   - 自由予約リクエスト(source_session_id IS NULL): 旧reject_session_booking_requestと
--     同様、この1件のみを却下する。理由(p_reason)を記録し、生徒へSESSION_BOOKING_REJECTED
--     通知を送る。
-- 呼び出し元は対象となる候補のうちどれか1件のproposal_idを渡せばよく（振替候補の場合、
-- UIは特定の候補を選ばせず「まとめて却下」ボタンのみを提示するため、グループの先頭要素の
-- proposal_idを渡す想定）、本関数側でsource_session_id単位のグルーピングを解決する。
--
-- 【通知メールに申請の日時を載せる (2026-10-06追加)】
-- 通知メールに申請した日時（開始〜終了）と理由を載せるため、payload に proposal_id を含める。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_slot_proposal(p_proposal_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
    v_responder_id uuid;
    v_coach_name text;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_slot_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    v_responder_id := CASE WHEN v_proposal.proposed_by_role = 2 THEN v_proposal.student_id ELSE v_proposal.coach_id END;
    PERFORM public.fn_assert_actor_or_admin(v_responder_id, 'not authorized to respond to this proposal');

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    IF v_proposal.source_session_id IS NOT NULL THEN
        UPDATE public.com_t_session_slot_proposal
        SET status = 3, responded_at = NOW(), update_date = NOW()
        WHERE source_session_id = v_proposal.source_session_id AND status = 1;
    ELSE
        UPDATE public.com_t_session_slot_proposal
        SET status = 3, reject_reason = p_reason, responded_at = NOW(), update_date = NOW()
        WHERE proposal_id = p_proposal_id;

        SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_proposal.coach_id;
        PERFORM public.fn_notify(
            v_proposal.student_id,
            'SESSION_BOOKING_REJECTED',
            jsonb_build_object('proposal_id', p_proposal_id, 'coach_name', v_coach_name, 'reject_reason', p_reason, 'requested_start_datetime', v_proposal.proposed_start_datetime),
            '/live-room'
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_slot_proposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_slot_proposal(uuid, text) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】専属コーチのマッチングの時刻を生徒側で固定する（空き時間のUTC化・申請時の生徒のタイムゾーン）
-- 追加日: 2026-10-06
--
-- 【内容】
--   コーチ側の夏時間の切り替えで、生徒（日本時間）から見たセッションの時刻が1時間ずれていた問題の対応。
--   1. com_m_lesson_schedule.coach_timezone を schedule_timezone に名前変更（曜日・時刻を解釈するタイムゾーン。意味は同じ）
--   2. com_t_matching_request.requested_timezone を追加（申請時の生徒のタイムゾーン。既存行は従来の基準＝コーチのタイムゾーン）
--   3. com_m_coach_availability を UTC 基準に変換（適用時点のコーチの時差で変換。UTCで日をまたぐ行は2行に分ける。
--      2回目以降の実行は何もしない）
--   4. fn_weekly_occurrences（毎週の枠の実際の日時の一覧）を新規作成
--   5. check_coach_schedule_conflict を実際の日時で比べる形に変更（シグネチャ変更。旧シグネチャは削除）
--   6. get_coaches_unavailable_slots の戻り値に基準のタイムゾーンを追加（旧定義は削除）
--   7. fn_generate_sessions_for_schedule: schedule_timezone で各回を作る・BLOCK 例外を実際の日時で比べる
--   8. fn_commit_matching_schedule: 基準のタイムゾーンを受け取る（シグネチャ変更）・ロックをコーチ単位に
--   9. approve_matching_request / admin_match_student_with_coach: 申請時の生徒のタイムゾーンで成立させる
--      （アドミンの直接マッチングは、入力の曜日・時刻を生徒の時刻として扱う）
--   - 既存の定期スケジュール・セッションは変換しない（コーチのタイムゾーンのまま従来どおり動く。dev/staging/本番とも
--     テストデータのみのため、コーチ側の夏時間の切り替え後に生徒側の時刻が1時間ずれることは許容する）。
--
-- 対応ファイル: DDL/table/com_m_lesson_schedule.sql, DDL/table/com_t_matching_request.sql,
--   DDL/table/com_m_coach_availability.sql, DDL/function/fn_weekly_occurrences.sql,
--   DDL/function/check_coach_schedule_conflict.sql, DDL/function/get_coaches_unavailable_slots.sql,
--   DDL/function/fn_generate_sessions_for_schedule.sql, DDL/function/fn_commit_matching_schedule.sql,
--   DDL/function/approve_matching_request.sql, DDL/function/admin_match_student_with_coach.sql
-- 【注意】列名の変更・空き時間の変換・関数のシグネチャ変更があり、旧アプリとは互換性が無い。
--   適用とアプリ（admin・student・coach）のデプロイを続けて行うこと（間はマッチング・空き時間の画面が正しく動かない）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- 追加パッチ: 曜日・時刻の基準を生徒の申請時のタイムゾーンに変更 (2026-10-06)
-- 既存環境に対しては、このブロックのみを実行してください（何度実行しても安全）。
---------------------------------------------
-- 【背景】
-- day_of_week/start_time/end_time をコーチの現地時刻で持っていたため、コーチ側の夏時間の
-- 切り替えで、生徒（日本時間）から見たセッションの時刻が1時間ずれていた。
-- 以後は、成立元の申請（com_t_matching_request.requested_timezone = 生徒の申請時のタイムゾーン）の
-- 曜日・時刻をそのまま引き継ぎ、セッションもそのタイムゾーンで作る（夏時間をまたいでも生徒側の時刻は変わらない）。
-- 列は「曜日・時刻を解釈するタイムゾーン」のまま意味を変えないため、名前だけ schedule_timezone に変える。
-- 既存の行（コーチのタイムゾーンで成立した分）は変換しない（そのタイムゾーンで解釈すれば従来どおり動く）。
-- start_date/end_date も schedule_timezone での日付として扱う。
---------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'com_m_lesson_schedule' AND column_name = 'coach_timezone'
    ) THEN
        ALTER TABLE public.com_m_lesson_schedule RENAME COLUMN coach_timezone TO schedule_timezone;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'com_m_lesson_schedule_coach_timezone_fkey') THEN
        ALTER TABLE public.com_m_lesson_schedule
            RENAME CONSTRAINT com_m_lesson_schedule_coach_timezone_fkey TO com_m_lesson_schedule_schedule_timezone_fkey;
    END IF;
END $$;

COMMENT ON COLUMN public.com_m_lesson_schedule.day_of_week IS '曜日 0:日 ... 6:土（schedule_timezone基準）';
COMMENT ON COLUMN public.com_m_lesson_schedule.start_time IS 'レッスン開始時刻（schedule_timezoneの現地時刻）';
COMMENT ON COLUMN public.com_m_lesson_schedule.end_time IS 'レッスン終了時刻（schedule_timezoneの現地時刻、通常25分）';
COMMENT ON COLUMN public.com_m_lesson_schedule.schedule_timezone IS 'day_of_week/start_time/end_time/start_date/end_dateの解釈に使うIANAタイムゾーン。2026-10-06以降の成立分は生徒の申請時のタイムゾーン（com_t_matching_request.requested_timezone）、それ以前の成立分はコーチの承認時のタイムゾーン。以後のプロフィールのtimezone変更の影響を受けない';
COMMENT ON COLUMN public.com_m_lesson_schedule.start_date IS 'Session自動生成の起点日（schedule_timezoneの日付）';
COMMENT ON COLUMN public.com_m_lesson_schedule.end_date IS 'Session自動生成の終点日（通常はライセンス終了日、schedule_timezoneの日付）';

---------------------------------------------
-- 追加パッチ: 申請時の生徒のタイムゾーン (2026-10-06)
-- 既存環境に対しては、このブロックのみを実行してください（何度実行しても安全）。
-- 前提: table/com_m_lesson_schedule.sql の schedule_timezone への列名変更パッチが適用済みであること。
---------------------------------------------
-- 【背景】
-- requested_day_of_week/requested_start_time/requested_end_time をコーチの現地時刻で持っていたため、
-- コーチ側の夏時間の切り替えで、生徒から見たセッションの時刻が1時間ずれていた。
-- 以後は、生徒が選んだ曜日・時刻を生徒の現地時刻のまま持ち、そのタイムゾーン（申請時の
-- com_m_user.timezone のスナップショット）を requested_timezone に保存する。承認時は
-- com_m_lesson_schedule.schedule_timezone に引き継ぎ、契約期間中の全回を生徒側で同じ時刻にする
-- （例: 20:00 に申請したら、夏時間の切り替えの前後どちらの回も 20:00）。
-- アドミンの直接マッチング（admin_match_student_with_coach）も、入力された曜日・時刻を生徒の時刻として扱う。
--
-- 【既存行】
-- 従来の解釈基準（コーチのタイムゾーン）を入れる。承認済みは成立した定期スケジュールの値、
-- それ以外は宛先コーチの現在のタイムゾーン。
---------------------------------------------
ALTER TABLE public.com_t_matching_request
  ADD COLUMN IF NOT EXISTS requested_timezone text REFERENCES public.com_m_timezone(timezone);

UPDATE public.com_t_matching_request r
SET requested_timezone = s.schedule_timezone
FROM public.com_m_lesson_schedule s
WHERE s.source_request_id = r.request_id AND r.requested_timezone IS NULL;

UPDATE public.com_t_matching_request r
SET requested_timezone = COALESCE(u.timezone, 'Asia/Tokyo')
FROM public.com_m_user u
WHERE u.id = r.coach_id AND r.requested_timezone IS NULL;

ALTER TABLE public.com_t_matching_request ALTER COLUMN requested_timezone SET NOT NULL;

COMMENT ON COLUMN public.com_t_matching_request.requested_day_of_week IS '希望曜日 0:日 ... 6:土（requested_timezone基準）';
COMMENT ON COLUMN public.com_t_matching_request.requested_start_time IS '希望レッスン開始時刻（requested_timezoneの現地時刻）';
COMMENT ON COLUMN public.com_t_matching_request.requested_end_time IS '希望レッスン終了時刻（requested_timezoneの現地時刻、通常25分）';
COMMENT ON COLUMN public.com_t_matching_request.requested_timezone IS '希望曜日・時刻の解釈に使うIANAタイムゾーン（申請時の生徒のcom_m_user.timezone。2026-10-06より前の行はコーチのタイムゾーン）。承認時にcom_m_lesson_schedule.schedule_timezoneへ引き継ぐ';

---------------------------------------------
-- 追加パッチ: UTC基準への変更 (2026-10-06)
-- 既存環境に対しては、このブロックのみを実行してください（2回目以降の実行は何もしない）。
---------------------------------------------
-- 【背景】
-- コーチの現地時刻で持つと、コーチ側の夏時間の切り替えで、生徒（日本時間）から見た枠・
-- セッションの時刻が1時間ずれていた。空き時間をUTCで持ち、生徒から見た枠の時刻を固定する
-- （申請・定期スケジュールは生徒の申請時のタイムゾーンで持つ。table/com_t_matching_request.sql 参照）。
--
-- 【既存行の変換】
-- 各行を、適用した時点のコーチのタイムゾーン（com_m_user.timezone）の時差でUTCへ変換する
-- （適用直後のコーチの画面には、変換前と同じ現地時刻で表示される）。UTCで日をまたぐ行は
-- 2行に分ける（後半を新しい行として追加する）。論理削除済みの行も同じ基準にそろえる。
-- 変換済みかどうかはテーブルのコメント（'UTC基準'）で判定し、2回目以降は何もしない。
---------------------------------------------
DO $$
BEGIN
    IF obj_description('public.com_m_coach_availability'::regclass, 'pg_class') LIKE '%UTC基準%' THEN
        RAISE NOTICE 'com_m_coach_availability is already UTC based. skipped.';
        RETURN;
    END IF;

    CREATE TEMP TABLE tmp_availability_utc ON COMMIT DROP AS
    WITH src AS (
        SELECT
            a.availability_id,
            a.end_time - a.start_time AS duration,
            -- 現地の今日以降で、最初にその曜日になる日（その日の時差で変換する）
            ((NOW() AT TIME ZONE tz.name)::date
                + ((a.day_of_week - EXTRACT(DOW FROM (NOW() AT TIME ZONE tz.name))::int + 7) % 7)
                + a.start_time) AT TIME ZONE tz.name AS start_ts
        FROM public.com_m_coach_availability a
        JOIN public.com_m_user u ON u.id = a.coach_id
        CROSS JOIN LATERAL (SELECT COALESCE(u.timezone, 'Asia/Tokyo') AS name) tz
    )
    SELECT
        availability_id,
        (start_ts AT TIME ZONE 'UTC') AS start_utc,
        (start_ts AT TIME ZONE 'UTC') + duration AS end_utc
    FROM src;

    -- UTCで日をまたぐ行の後半（翌日の 00:00〜）を新しい行として追加する
    INSERT INTO public.com_m_coach_availability (coach_id, day_of_week, start_time, end_time, delete_flg, insert_date, update_date)
    SELECT a.coach_id, EXTRACT(DOW FROM t.end_utc)::smallint, '00:00:00'::time, t.end_utc::time, a.delete_flg, a.insert_date, NOW()
    FROM tmp_availability_utc t
    JOIN public.com_m_coach_availability a ON a.availability_id = t.availability_id
    WHERE t.end_utc::date > t.start_utc::date
      AND t.end_utc::time > '00:00:00'::time;

    UPDATE public.com_m_coach_availability a
    SET day_of_week = EXTRACT(DOW FROM t.start_utc)::smallint,
        start_time = t.start_utc::time,
        end_time = CASE WHEN t.end_utc::date > t.start_utc::date THEN '24:00:00'::time ELSE t.end_utc::time END,
        update_date = NOW()
    FROM tmp_availability_utc t
    WHERE a.availability_id = t.availability_id;

    COMMENT ON TABLE public.com_m_coach_availability IS 'コーチ空き時間マスタ（週次繰り返しのレッスン可能時間帯。UTC基準）';
    COMMENT ON COLUMN public.com_m_coach_availability.day_of_week IS '曜日 0:日 1:月 2:火 3:水 4:木 5:金 6:土（UTC基準）';
    COMMENT ON COLUMN public.com_m_coach_availability.start_time IS '対応可能開始時刻（UTC）';
    COMMENT ON COLUMN public.com_m_coach_availability.end_time IS '対応可能終了時刻（UTC。日の終わりは24:00:00）';
END $$;

---------------------------------------------
-- 毎週の枠の実際の日時の一覧 (2026-10-06 追加)
---------------------------------------------
-- 【背景】
-- 定期スケジュール・マッチング申請の「毎週◯曜◯時」は、それぞれの基準のタイムゾーン
-- （com_m_lesson_schedule.schedule_timezone / com_t_matching_request.requested_timezone）の現地時刻で持つ。
-- 基準が生徒ごとに異なり、夏時間のある地域ではUTCでの曜日・時刻が期間の途中で変わるため、
-- 「同じ曜日・時刻か」の比較では重なりを判定できない。本関数で期間内の各回の実際の日時（UTC）に
-- 展開してから比べる（check_coach_schedule_conflict 参照）。
--
-- 【仕様】
-- p_timezone の現地の日付で p_from〜p_to の範囲の各日のうち曜日が一致する日について、
-- その日の p_start_time〜p_end_time を実際の日時に変換して返す。開始が p_from より前、
-- または終了が p_to より後の回は含めない（セッションの作成 fn_generate_sessions_for_schedule と同じ変換）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_weekly_occurrences(
    p_timezone text,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_from timestamptz,
    p_to timestamptz
)
RETURNS TABLE (start_ts timestamptz, end_ts timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT o.start_ts, o.end_ts
    FROM generate_series(
        (p_from AT TIME ZONE p_timezone)::date,
        (p_to AT TIME ZONE p_timezone)::date,
        interval '1 day'
    ) AS d(day)
    CROSS JOIN LATERAL (
        SELECT (d.day::date + p_start_time) AT TIME ZONE p_timezone AS start_ts,
               (d.day::date + p_end_time) AT TIME ZONE p_timezone AS end_ts
    ) o
    WHERE EXTRACT(DOW FROM d.day)::smallint = p_day_of_week
      AND o.start_ts >= p_from
      AND o.end_ts <= p_to;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_weekly_occurrences(text, smallint, time, time, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- コーチの定期スケジュール重複判定ヘルパー関数 (2026-09-03 追加)
---------------------------------------------
-- 【背景】
-- マッチングリクエストの申請時(createMatchingRequestCore)・承認時(approve_matching_request)の
-- 両方から共通で呼び出す、コーチの既存の稼働中スケジュール(com_m_lesson_schedule.status=1)との
-- 重複判定。重なる回が1回でもあればtrueを返す。
--
-- com_m_lesson_scheduleはRLSで「本人(student_id/coach_id)またはadmin」しか閲覧できないため、
-- 生徒が別の生徒とコーチの組み合わせの空き状況を判定するにはSECURITY DEFINERが必須。
-- 戻り値はbooleanのみで行データそのものは返さないため、authenticated全体への公開で問題ない。
--
-- 【実際の日時での比較 (2026-10-06変更)】
-- 申請・定期スケジュールの曜日・時刻は、それぞれの基準のタイムゾーン（生徒の申請時のタイムゾーン等）の
-- 現地時刻で持つようになった。基準が行ごとに異なり、夏時間のある地域ではUTCでの曜日・時刻が期間の
-- 途中で変わるため、曜日・時刻の一致ではなく、期間内の各回の実際の日時（fn_weekly_occurrences）が
-- 重なるかで判定する。
--   - 候補: p_timezone の現地時刻の毎週 p_day_of_week の p_start_time〜p_end_time（p_from〜p_to の範囲）
--   - 既存: 稼働中の定期スケジュールの各回（schedule_timezone の start_date〜end_date の範囲）
-- 旧シグネチャ(uuid, smallint, time, time, date, date)は削除する。
---------------------------------------------
DROP FUNCTION IF EXISTS public.check_coach_schedule_conflict(uuid, smallint, time, time, date, date);

CREATE OR REPLACE FUNCTION public.check_coach_schedule_conflict(
    p_coach_id uuid,
    p_timezone text,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_from timestamptz,
    p_to timestamptz
)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.com_m_lesson_schedule s
    CROSS JOIN LATERAL public.fn_weekly_occurrences(
        s.schedule_timezone, s.day_of_week, s.start_time, s.end_time,
        GREATEST(s.start_date::timestamp AT TIME ZONE s.schedule_timezone, p_from),
        LEAST((s.end_date + 1)::timestamp AT TIME ZONE s.schedule_timezone, p_to)
    ) existing
    JOIN public.fn_weekly_occurrences(
        p_timezone, p_day_of_week, p_start_time, p_end_time, p_from, p_to
    ) candidate
      ON existing.start_ts < candidate.end_ts AND existing.end_ts > candidate.start_ts
    WHERE s.coach_id = p_coach_id
      AND s.status = 1
      AND s.start_date::timestamp AT TIME ZONE s.schedule_timezone < p_to
      AND (s.end_date + 1)::timestamp AT TIME ZONE s.schedule_timezone > p_from
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.check_coach_schedule_conflict(uuid, text, smallint, time, time, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_coach_schedule_conflict(uuid, text, smallint, time, time, timestamptz, timestamptz) TO authenticated;

---------------------------------------------
-- コーチの予約済み枠（曜日・時間帯）一括取得ヘルパー関数 (2026-09-03 追加)
---------------------------------------------
-- 【背景】
-- 生徒向けマッチング申請カレンダー(RequestDialog)で、既に埋まっている曜日・時間帯を
-- 選択できないよう事前にグレーアウト表示するために使う（旅行・ホテル予約サイトの
-- 空室検索と同様のUXパターン）。あくまでUI側の事前ガイド（ソフトチェック）であり、
-- 最終的な整合性はcheck_coach_schedule_conflict()による申請時・承認時のチェックで担保する。
--
-- com_m_lesson_schedule/com_t_matching_requestはいずれもRLSで本人・担当コーチ・adminしか
-- 閲覧できないため、他の生徒の予約状況を横断的に見るにはSECURITY DEFINERが必須。
-- 戻り値は曜日・時間帯のみで、どの生徒が確保しているか（student_id等）は一切含めない。
--
-- 【対象】
-- 1. com_m_lesson_schedule (status=1: 稼働中) ... 承認済みの確定予約
-- 2. com_t_matching_request (status=1: pending) ... 承認待ちの申請
--    （承認待ち同士が重複しても申請時・承認時のハードチェックでは弾かないが、円滑な
--    マッチングのため、カレンダー上は先に申請された枠として選択不可にしておく）
--
-- 契約期間(start_date/end_date)による絞り込みは行わない（コーチのその曜日・時間帯が
-- 現に埋まっているかどうかの単純な表示用途のため。日付範囲まで含めた厳密な判定は
-- check_coach_schedule_conflict()側の役割とする）。
--
-- 【タイムゾーン (2026-10-06変更)】
-- 曜日・時間帯は、行ごとの基準のタイムゾーン（定期スケジュールは schedule_timezone、申請は requested_timezone）の
-- 現地時刻で返す。呼び出し側は直近の回の日時に換算して、UTCの空き時間（com_m_coach_availability）と比べる。
-- 戻り値の列が増えるため、旧定義を削除してから作り直す。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_coaches_unavailable_slots(uuid[]);

CREATE OR REPLACE FUNCTION public.get_coaches_unavailable_slots(p_coach_ids uuid[])
RETURNS TABLE (coach_id uuid, timezone text, day_of_week smallint, start_time time, end_time time) AS $$
  SELECT s.coach_id, s.schedule_timezone, s.day_of_week, s.start_time, s.end_time
  FROM public.com_m_lesson_schedule s
  WHERE s.coach_id = ANY(p_coach_ids) AND s.status = 1
  UNION
  SELECT r.coach_id, r.requested_timezone, r.requested_day_of_week, r.requested_start_time, r.requested_end_time
  FROM public.com_t_matching_request r
  WHERE r.coach_id = ANY(p_coach_ids) AND r.status = 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_coaches_unavailable_slots(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coaches_unavailable_slots(uuid[]) TO authenticated;

---------------------------------------------
-- 定期スケジュールから個別セッションを一括生成するヘルパー関数 (2026-08-15 追加)
-- 前提: table/com_m_lesson_schedule.sql, table/com_t_session.sql,
--       table/com_t_coach_availability_exception.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- com_m_lesson_schedule（毎週◯曜◯時の定期パターン）確定時に、
-- start_date〜end_date（通常はライセンス期間）の範囲で対象曜日の
-- com_t_session行をまとめて生成する。approve_matching_request() から呼ばれる。
--
-- 【タイムゾーン変換】
-- スケジュールはコーチのローカル時刻（壁時計時刻）で保持しているため、
-- 各日付ごとに schedule.coach_timezone（承認時点でスナップショットされたコーチの
-- タイムゾーン）を用いて絶対時刻(timestamptz)へ変換する。com_m_user.timezoneを
-- ライブ参照しないのは、承認後にコーチがプロフィールのtimezoneを変更しても、
-- 既に生徒と合意済みの曜日・時刻の意味が事後的にズレないようにするため。
-- 同一の「毎週火曜18:00」でも、coach_timezone内でDSTが発生する期間をまたぐ場合、
-- UTC換算のオフセットは日付ごとに自動的に正しく計算される。
--
-- 【例外日のスキップ】
-- com_t_coach_availability_exception に当該日・当該コーチのBLOCK（休み）が
-- 時間帯重複で存在する場合、その回はスキップする（欠番。振替は別途Phase3のUIで対応）。
--
-- 【冪等性】
-- com_t_session (schedule_id, start_datetime) にUNIQUE制約があるため、
-- 再実行しても重複は作成されない（ON CONFLICT DO NOTHING）。
--
-- 【生成上限 (2026-09-14追加)】
-- 生成件数がschedule.target_sessions（このコマが契約上持つべき目標セッション数）に
-- 達したら、end_dateに達していなくてもそこで打ち切る。end_date到達時点で
-- target_sessionsに満たない場合（マッチング承認が遅れた、BLOCK例外で欠番が出た等）でも
-- end_dateを超えて延長はしない。その不足はfn_schedule_shortfall()のshortfallとして
-- 可視化するのみとし、埋めるかどうかはコーチ・アドミンの運用判断に委ねる。
--
-- 【不具合修正: ON CONFLICT対象と一意インデックスの不一致 (2026-09-14)】
-- 2026-09-12の「Wブッキング防止の一意制約を有効な予約枠のみに限定」パッチで
-- uq_session_schedule_datetimeを「WHERE status = 1」の部分一意インデックスに変更した際、
-- 本関数のON CONFLICT (schedule_id, start_datetime)にも同じWHERE句を追記する必要が
-- あったが漏れていた。部分一意インデックスをON CONFLICTの推論対象にするには、
-- INSERT側のON CONFLICT節にも同一のWHERE句を明示する必要があり(Postgresの仕様)、
-- 一致しない場合は実際の重複有無に関わらず常にエラー(42P10: no unique or
-- exclusion constraint matching the ON CONFLICT specification)になる。これにより
-- 2026-09-12以降、本関数を経由するセッション生成(マッチング承認・アドミン直接
-- マッチングいずれも)が全件失敗する状態になっていた。
--
-- 【p_min_start_datetime追加: 24時間ルールのマッチング申請への適用 (2026-09-15)】
-- 生徒・コーチ向けの新規予約(create_session_booking_request)・振替候補
-- (cancel_session/accept_session_reschedule_proposal)には「開始24時間以内の予約不可」
-- ルールがあるが、マッチング承認時に自動生成される初回セッションにはこれが未適用だった
-- （曜日パターンの都合で、承認したその日のうちに開始してしまう回が生成され得る）。
-- 呼び出し元(approve_matching_request)が生成範囲の下限としてp_min_start_datetimeを
-- 渡せるようにし、これを下回る回はカウントせずスキップして次週に進める（BLOCK例外と
-- 同様、欠番として扱いfn_schedule_shortfall()のshortfallに反映させる。end_dateを超えた
-- 延長はしない、という既存方針を踏襲）。アドミン代理マッチング(admin_match_student_with_coach)
-- はこのルールの対象外のため、NULL（デフォルト、下限なし）のまま呼び出す。
--
-- 【ライセンス期間の境目 (2026-10-03)】
-- start_date/end_date はライセンスの開始・終了日時を日付にした値（DBはUTCのため、JSTの0:00開始は
-- UTCでは前日）で、各回の日付はコーチの現地日付として扱う。このため境目で「契約開始の直前の回」
-- 「契約終了の直後の回」が作られ得た（例: NYのコーチの火曜9:00は、水曜0:00 JST開始の契約の前）。
-- 各回の開始・終了日時をライセンスの開始・終了日時と直接比べ、開始前の回はスキップ（カウントしない）、
-- 終了を過ぎる回に達したら打ち切る。全ての呼び出し元（承認・アドミン代理・目標数の調整）に効く。
--
-- 【基準のタイムゾーン (2026-10-06変更)】
-- 曜日・時刻は schedule.schedule_timezone（旧 coach_timezone。2026-10-06以降の成立分は生徒の申請時の
-- タイムゾーン）の現地時刻で解釈する。コーチ側の夏時間の切り替えをまたいでも、生徒側の時刻は全回同じになる。
-- BLOCK（休み）の例外はコーチの現地の日付・時刻で持つため、コーチの現在のタイムゾーンで実際の日時に
-- 直してから、各回の日時と重なるかを比べる。
---------------------------------------------
DROP FUNCTION IF EXISTS public.fn_generate_sessions_for_schedule(uuid);

CREATE OR REPLACE FUNCTION public.fn_generate_sessions_for_schedule(
    p_schedule_id uuid,
    p_min_start_datetime timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_schedule_tz text;
    v_coach_tz text;
    v_cursor_date date;
    v_start_ts timestamptz;
    v_end_ts timestamptz;
    v_generated_count integer := 0;
    v_license_start timestamptz;
    v_license_end timestamptz;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    -- com_m_user.timezoneはライブ参照しない（上記【タイムゾーン変換】コメント参照）
    v_schedule_tz := v_schedule.schedule_timezone;
    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_coach_tz FROM public.com_m_user WHERE id = v_schedule.coach_id;

    -- 予約できる範囲（ライセンスの開始・終了日時。上記【ライセンス期間の境目】参照）
    SELECT l.start_date, l.end_date INTO v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = v_schedule.ticket_id;

    -- start_date以降で最初にday_of_weekと一致する日付を求める
    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date AND v_generated_count < v_schedule.target_sessions LOOP
        v_start_ts := (v_cursor_date + v_schedule.start_time) AT TIME ZONE v_schedule_tz;
        v_end_ts := (v_cursor_date + v_schedule.end_time) AT TIME ZONE v_schedule_tz;

        -- ライセンスの終了を過ぎる回に達したら打ち切る（以降の回も全て終了後）
        IF v_end_ts > v_license_end THEN
            EXIT;
        END IF;

        -- ライセンスの開始前の回はスキップする（カウントしない）
        IF v_start_ts < v_license_start THEN
            v_cursor_date := v_cursor_date + 7;
            CONTINUE;
        END IF;

        -- 24時間ルールの下限を下回る回は欠番としてスキップする（上記コメント参照）
        IF p_min_start_datetime IS NOT NULL AND v_start_ts < p_min_start_datetime THEN
            v_cursor_date := v_cursor_date + 7;
            CONTINUE;
        END IF;

        -- この回と重なるBLOCK例外（コーチの現地の日付・時刻）が無いことを確認
        -- （タイムゾーンの差で日付がずれるため、前後1日の例外を実際の日時に直して比べる）
        IF NOT EXISTS (
            SELECT 1 FROM public.com_t_coach_availability_exception e
            WHERE e.coach_id = v_schedule.coach_id
              AND e.exception_date BETWEEN v_cursor_date - 1 AND v_cursor_date + 1
              AND e.exception_type = 'BLOCK'
              AND (e.exception_date + e.start_time) AT TIME ZONE v_coach_tz < v_end_ts
              AND (e.exception_date + e.end_time) AT TIME ZONE v_coach_tz > v_start_ts
        ) THEN
            INSERT INTO public.com_t_session (
                schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
            ) VALUES (
                v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
                v_start_ts, v_end_ts, 1
            )
            ON CONFLICT (schedule_id, start_datetime) WHERE status = 1 DO NOTHING;

            IF FOUND THEN
                v_generated_count := v_generated_count + 1;
            END IF;
        END IF;

        v_cursor_date := v_cursor_date + 7;
    END LOOP;

    RETURN v_generated_count;
END;
$$;

-- 内部処理専用（approve_matching_request/admin_match_student_with_coach経由以外での
-- 直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_generate_sessions_for_schedule(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- マッチング成立処理 共通ヘルパー関数 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- approve_matching_request()（生徒申請→コーチ承認の通常フロー）と
-- admin_match_student_with_coach()（アドミンによる代理即時マッチング）は、
-- 「承認済みのcom_t_matching_requestが既に存在する前提で、target_sessionsを算出し、
-- コーチの空き状況をロック付きで再チェックし、com_m_lesson_scheduleを作成し、
-- com_t_sessionを一括生成する」という承認後ロジックがほぼ丸ごと重複していた
-- （admin_match_student_with_coachのファイル冒頭コメントで「approve_matching_requestの
-- 承認後ロジックをそのまま踏襲」と明記されていた通り）。本関数にその共通部分を集約し、
-- 両者はそれぞれ「com_t_matching_requestの確定方法（既存pending行をUPDATE／新規に
-- approved行をINSERT）」と「通知内容（コーチへの通知要否）」だけを担当する薄いラッパーとする。
--
-- 【呼び出し元の責務分担】
-- 本関数は対象のcom_t_matching_request行(p_request_id)を一切読み書きしない
-- （既に存在する前提で、source_request_idとしてFK参照するのみ）。呼び出し元が
-- 承認フロー(UPDATE status=2)・代理作成フロー(INSERT status=2)いずれの場合も、
-- 本関数を呼ぶ前後で自身の責務としてリクエスト行を確定させること。
--
-- 【24時間ルールとの関係】
-- p_min_start_datetimeはfn_generate_sessions_for_schedule()にそのまま渡すのみで、
-- 「アドミンかどうかで下限を変えるか」の判断自体は呼び出し元(approve_matching_request/
-- admin_match_student_with_coach)の責務のままとする。
--
-- 【チャットルーム開設・挨拶メッセージ (2026-09-28追加)】
-- 成立のたびにfn_send_matching_greeting()で生徒×コーチの1対1チャットルームを用意し（開設済みなら
-- それを使う）、コーチから生徒へ挨拶メッセージを送る。成立処理と同じトランザクションで行う。
--
-- 【基準のタイムゾーン (2026-10-06変更)】
-- p_day_of_week/p_start_time/p_end_time は p_timezone（申請の requested_timezone = 生徒の申請時のタイムゾーン）の
-- 現地時刻として受け取り、com_m_lesson_schedule.schedule_timezone にそのまま保存する（従来は承認時のコーチの
-- タイムゾーンを保存していたため、コーチ側の夏時間の切り替えで生徒側の時刻がずれていた）。
-- start_date/end_date もこのタイムゾーンの日付にする。重複チェックは実際の日時で比べる
-- check_coach_schedule_conflict() を使い、基準のタイムゾーンが申請ごとに異なっても曜日をまたいで
-- 重なり得るため、同時承認を防ぐロックは「コーチ単位」にする（旧: コーチ×曜日）。
-- シグネチャが変わるため、旧シグネチャを削除してから作り直す。
---------------------------------------------
DROP FUNCTION IF EXISTS public.fn_commit_matching_schedule(uuid, uuid, uuid, uuid, smallint, smallint, time, time, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_commit_matching_schedule(
    p_request_id uuid,
    p_ticket_id uuid,
    p_student_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_timezone text,
    p_min_start_datetime timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_license_start timestamptz;
    v_license_end timestamptz;
    v_start_date date;
    v_end_date date;
    v_schedule_id uuid;
    v_ticket_total_sessions smallint;
    v_ticket_weekly_frequency smallint;
    v_target_sessions smallint;
BEGIN
    -- 対象チケットに紐づくライセンス期間(Session生成範囲の基準)と、target_sessions算出用の
    -- total_sessions/weekly_frequencyを取得
    SELECT l.start_date, l.end_date, t.total_sessions, t.weekly_frequency
    INTO v_license_start, v_license_end, v_ticket_total_sessions, v_ticket_weekly_frequency
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    -- 生成範囲は基準のタイムゾーンの日付（各回の日時はfn_generate_sessions_for_schedule()でライセンスの
    -- 開始・終了日時と直接比べるため、日付は範囲の目安）
    v_start_date := GREATEST((v_license_start AT TIME ZONE p_timezone)::date, (NOW() AT TIME ZONE p_timezone)::date);
    v_end_date := (v_license_end AT TIME ZONE p_timezone)::date;

    -- このコマ(slot_no)が契約上持つべき目標セッション数。商をbaseとし、余りはslot_no昇順に
    -- 1つずつ多く配分する（table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）
    v_target_sessions := (v_ticket_total_sessions / v_ticket_weekly_frequency)
        + CASE WHEN p_slot_no <= (v_ticket_total_sessions % v_ticket_weekly_frequency) THEN 1 ELSE 0 END;

    -- 同一コーチへの成立処理を直列化し、重複チェックのレース条件を防ぐ
    -- （この後にfn_send_matching_greeting()内で生徒×コーチのロックを取るが、そちらの後に
    -- 別のロックを取る処理は無いため、デッドロックは起こらない）
    PERFORM pg_advisory_xact_lock(hashtextextended('matching:' || p_coach_id::text, 0));

    IF public.check_coach_schedule_conflict(
        p_coach_id, p_timezone, p_day_of_week, p_start_time, p_end_time,
        GREATEST(v_license_start, NOW()), v_license_end
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_CONFLICT: coach % already has an overlapping active schedule', p_coach_id;
    END IF;

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        schedule_timezone, status, start_date, end_date, source_request_id, target_sessions
    ) VALUES (
        p_ticket_id, p_student_id, p_coach_id, p_slot_no,
        p_day_of_week, p_start_time, p_end_time,
        p_timezone, 1, v_start_date, v_end_date, p_request_id, v_target_sessions
    )
    RETURNING schedule_id INTO v_schedule_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id, p_min_start_datetime);

    PERFORM public.fn_send_matching_greeting(v_schedule_id);

    RETURN v_schedule_id;
END;
$$;

-- 内部処理専用（approve_matching_request/admin_match_student_with_coach経由以外での
-- 直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_commit_matching_schedule(uuid, uuid, uuid, uuid, smallint, smallint, time, time, text, timestamptz) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- マッチングリクエスト承認RPC (2026-08-15 追加)
-- 前提: table/com_t_matching_request.sql, table/com_m_lesson_schedule.sql,
--       table/com_t_user_session_ticket.sql, table/com_t_user_license.sql,
--       function/fn_generate_sessions_for_schedule.sql,
--       function/check_coach_schedule_conflict.sql,
--       function/fn_assert_actor_or_admin.sql, function/fn_notify.sql,
--       function/fn_commit_matching_schedule.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチがマッチングリクエストを承認する唯一の入口。
-- com_t_matching_request への直接UPDATEはRLSで許可していないため、
-- 承認処理（ステータス更新 + com_m_lesson_schedule作成 + com_t_session一括生成）は
-- 必ず本関数を通す。SECURITY DEFINERにより、内部のテーブル操作はRLSをバイパスするが、
-- 呼び出し元が宛先コーチ本人（またはadmin）であることは関数内で明示的に検証する。
--
-- 【二重予約防止 (2026-09-03 追加)】
-- 申請時(createMatchingRequestCore)にも同一のcheck_coach_schedule_conflict()で重複チェックを
-- 行うが、申請〜承認の間に別の申請が先に承認される競合（TOCTOU）は申請時チェックだけでは
-- 防げない。そのため承認時にも必ず同じ関数で再チェックする。
-- 加えて、ほぼ同時に別々の承認処理（異なるrequest_id、同一コーチ×同一曜日）が走った場合、
-- どちらも重複チェック時点ではまだ相手のcom_m_lesson_schedule行が存在せず、チェックを
-- すり抜けてしまうレース条件が起こり得る。これを防ぐため、重複チェックの前に対象
-- (coach_id, day_of_week)単位のトランザクションアドバイザリロックを取得し、同一コーチ×
-- 同一曜日への承認処理を直列化する（コミット/ロールバックで自動解放。本関数内で取得する
-- ロックは常にこの1本のみのため、デッドロックの起こりようがない）。
--
-- 【通知 (2026-09-09追加)】
-- 承認完了時、生徒へマッチング成立を通知する(MATCHING_APPROVED)。コーチは自ら承認操作を
-- 行っているため通知不要。
--
-- 【target_sessionsの確定 (2026-09-14追加)】
-- com_m_lesson_schedule.target_sessions（このコマが契約上持つべき目標セッション数）を、
-- 対象チケットのtotal_sessions/weekly_frequencyから算出しここで確定する（table/
-- com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）。承認が契約開始から遅れても
-- 目標値自体は変わらないため、fn_generate_sessions_for_schedule()の生成上限、
-- fn_schedule_shortfall()の期待値が正しく契約のエンタイトルメントを反映するようになる。
--
-- 【権限チェック・通知の共通化 (2026-09-15追加)】
-- 権限チェックはfn_assert_actor_or_admin()、通知INSERTはfn_notify()にそれぞれ集約する
-- （複数のRPCに渡ってコピー&ペーストされていたパターンの共通化。詳細は各関数の
-- ファイル自身のコメント参照）。
--
-- 【マッチング成立処理の共通化 (2026-09-15追加)】
-- target_sessions算出〜アドバイザリロック〜空き状況チェック〜com_m_lesson_schedule作成〜
-- com_t_session一括生成は、admin_match_student_with_coach()とほぼ丸ごと重複していたため
-- fn_commit_matching_schedule()に切り出した。本関数は「pendingなリクエストを承認済みに
-- 更新する」責務のみを担い、成立処理そのものは同ヘルパーに委譲する
-- （詳細はfunction/fn_commit_matching_schedule.sql参照）。
--
-- 【24時間ルールの適用 (2026-09-15追加)】
-- 生徒の個別予約・振替候補と同様、コーチ自身の承認によるマッチング成立でも、承認した
-- その日のうちに開始してしまう初回セッションが生成され得る（曜日パターンの都合）。
-- コーチ本人の承認には24時間ルールを適用し、下限を下回る回はfn_generate_sessions_for_schedule()側で
-- 欠番としてスキップさせる。アドミンが本関数を代理承認する場合（get_jwt_user_type()='0'）は、
-- admin_match_student_with_coach()と同様このルールの対象外とする。
--
-- 【基準のタイムゾーン (2026-10-06追加)】
-- 申請の曜日・時刻は生徒の申請時のタイムゾーン（requested_timezone）の現地時刻のため、そのタイムゾーンを
-- fn_commit_matching_schedule() に渡し、定期スケジュール・セッションを生徒側の時刻で作る。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_matching_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_schedule_id uuid;
    v_coach_name text;
    v_min_start_datetime timestamptz;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to approve this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    -- アドミン代理承認は24時間ルールの対象外（admin_match_student_with_coach()と同様）
    IF public.get_jwt_user_type() = '0' THEN
        v_min_start_datetime := NULL;
    ELSE
        v_min_start_datetime := NOW() + interval '24 hours';
    END IF;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request.request_id, v_request.ticket_id, v_request.student_id, v_request.coach_id,
        v_request.slot_no, v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_request.requested_timezone, v_min_start_datetime
    );

    -- 生徒へ、マッチング成立を通知する（コーチは自ら承認操作を行ったため通知不要）
    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_APPROVED',
        jsonb_build_object('coach_name', v_coach_name, 'schedule_id', v_schedule_id),
        '/live-room'
    );

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;

---------------------------------------------
-- アドミンによる直接マッチングRPC (2026-09-09 追加)
-- 前提: table/com_t_matching_request.sql, table/com_m_lesson_schedule.sql,
--       table/com_t_user_session_ticket.sql, table/com_t_user_license.sql,
--       function/fn_generate_sessions_for_schedule.sql,
--       function/check_coach_schedule_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 通常のマッチングは「生徒がリクエスト→コーチが承認」の2段階を経るが、アドミンの
-- ライブセッション管理画面からは、この2段階を省略していきなり成立させたい
-- （契約途中のコーチ交代直後に、生徒・コーチの操作を待たずその場で新しい担当を
-- 割り当てたいケース等）。本関数はapprove_matching_request()の承認後ロジック
-- （アドバイザリロックによる直列化、コーチの空き時間衝突チェック、
-- com_m_lesson_schedule作成、com_t_session一括生成）をそのまま踏襲しつつ、
-- 事前にpendingなcom_t_matching_requestが存在しない状態から、承認済み(status=2)の
-- リクエストを直接作成する点のみが異なる。
--
-- 同一(ticket_id, slot_no)に既にpending/approvedなリクエストが存在する場合は
-- 一意制約(uq_matching_request_active_slot)違反として失敗する
-- （呼び出し元のTypeScript側で23505を捕捉し、分かりやすいエラーメッセージに変換すること。
-- createMatchingRequestCoreの既存パターンを参照）。
--
-- 【通知】
-- 生徒へMATCHING_APPROVED、コーチへMATCHING_ASSIGNED_TO_COACHをそれぞれ通知する
-- （どちらも自ら操作していないため、双方に通知が必要）。
--
-- 【target_sessionsの確定 (2026-09-14追加)】
-- approve_matching_requestと同様、com_m_lesson_schedule.target_sessionsをここで確定する
-- （table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）。
--
-- 【権限チェック・通知の共通化 (2026-09-15追加)】
-- 権限チェックはfn_assert_actor_or_admin()、通知INSERTはfn_notify()を使う
-- （前提: function/fn_assert_actor_or_admin.sql, function/fn_notify.sql）。
--
-- 【マッチング成立処理の共通化 (2026-09-15追加)】
-- target_sessions算出〜アドバイザリロック〜空き状況チェック〜com_m_lesson_schedule作成〜
-- com_t_session一括生成は、approve_matching_request()とほぼ丸ごと重複していたため
-- fn_commit_matching_schedule()に切り出した。本関数は「承認済みのリクエストを
-- 生徒の申請・コーチの承認を経ずに直接作成する」責務のみを担い、成立処理そのものは
-- 同ヘルパーに委譲する（詳細はfunction/fn_commit_matching_schedule.sql参照）。
--
-- 【24時間ルールの対象外 (2026-09-15追加)】
-- 生徒の個別予約・振替候補・通常のマッチング承認(approve_matching_request)には
-- 「開始24時間以内は不可」ルールを適用するが、本関数はアドミンが人間同士で既に
-- 調整済みの内容を即時反映するための専用ルートのため対象外とする。そのため
-- fn_commit_matching_schedule()呼び出し時にp_min_start_datetimeを渡さない
-- （デフォルトのNULL=下限なしのまま呼ぶ）。
--
-- 【曜日・時刻は生徒の時刻 (2026-10-06変更)】
-- 生徒の申請と同じく、p_day_of_week/p_start_time/p_end_time を生徒の現在のタイムゾーン
-- （com_m_user.timezone）の現地時刻として扱い、申請の requested_timezone と定期スケジュールの
-- schedule_timezone に保存する（従来はコーチの現地時刻）。シグネチャは変更しない。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_match_student_with_coach(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_schedule_id uuid;
    v_request_id uuid;
    v_coach_name text;
    v_student_name text;
    v_student_timezone text;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to perform admin matching');

    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_student_timezone FROM public.com_m_user WHERE id = v_student_id;

    -- 生徒の申請・コーチの承認を経ずに、承認済みのリクエストを直接作成する
    INSERT INTO public.com_t_matching_request (
        ticket_id, student_id, coach_id, slot_no, requested_day_of_week, requested_start_time, requested_end_time,
        requested_timezone, status, responded_by, responded_at
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        v_student_timezone, 2, auth.uid(), NOW()
    )
    RETURNING request_id INTO v_request_id;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request_id, p_ticket_id, v_student_id, p_coach_id,
        p_slot_no, p_day_of_week, p_start_time, p_end_time, v_student_timezone
    );

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = p_coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_student_id;

    PERFORM public.fn_notify(v_student_id, 'MATCHING_APPROVED', jsonb_build_object('coach_name', v_coach_name, 'schedule_id', v_schedule_id), '/live-room');
    PERFORM public.fn_notify(p_coach_id, 'MATCHING_ASSIGNED_TO_COACH', jsonb_build_object('student_name', v_student_name, 'schedule_id', v_schedule_id), '/students/' || v_student_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】コーチの空き時間の見直し通知（14日ごと・アプリ内通知のみ）
-- 追加日: 2026-10-06
--
-- 【内容】
--   1. com_m_coach_profile.availability_confirmed_at（空き時間を最後に確認した日時）を追加
--   2. fn_mark_coach_availability_confirmed / trg_coach_availability_confirmed（空き時間の保存で確認済みにする）、
--      confirm_my_coach_availability（「変更なしで確認」）、enqueue_coach_availability_reminders（通知の登録）を新規作成
--   3. pg_cron のジョブ 'coach-availability-reminders-daily'（毎日 00:15 UTC）を作成
--   - 空き時間が1件以上あるコーチは最後の確認から14日を過ぎたら見直し、0件のコーチには登録を促す
--     （通知種別 COACH_AVAILABILITY_REMINDER。メールは送らない）。
--
-- 対応ファイル: DDL/table/com_m_coach_profile.sql, DDL/function/enqueue_coach_availability_reminders.sql
-- 【注意】アプリ（コーチの空き時間の画面）が 1・2 を使うため、アプリのデプロイより先に適用すること。
--   旧アプリは通知種別 COACH_AVAILABILITY_REMINDER の文言を持たないため、適用からデプロイまでの間に
--   ジョブが動かないよう、適用はデプロイの直前に行う（ジョブは毎日 00:15 UTC のみ）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- 追加パッチ: 空き時間の最終確認日時 (2026-10-06)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- 空き時間（com_m_coach_availability）はUTCで持つため、コーチの現地時刻での表示は夏時間の切り替えで
-- 1時間ずれる。コーチに14日ごとに空き時間の見直しを促す通知を出すため、最後に空き時間を確認した
-- 日時を持つ（空き時間の保存、または「変更なしで確認」で更新。function/enqueue_coach_availability_reminders.sql）。
---------------------------------------------
ALTER TABLE public.com_m_coach_profile
  ADD COLUMN IF NOT EXISTS availability_confirmed_at timestamp with time zone DEFAULT NULL;

COMMENT ON COLUMN public.com_m_coach_profile.availability_confirmed_at IS '空き時間を最後に確認した日時（空き時間の保存・「変更なしで確認」で更新。NULLは未確認。14日を過ぎると見直しの通知を出す）';

---------------------------------------------
-- コーチの空き時間の見直し通知 (2026-10-06 追加)
-- 前提: table/com_m_coach_profile.sql（availability_confirmed_at パッチ）, table/com_m_coach_availability.sql,
--       table/com_t_notification.sql, function/fn_notify.sql の作成が完了していること。pg_cron が有効であること。
---------------------------------------------
-- 【背景】
-- 空き時間（com_m_coach_availability）はUTCで持つため、コーチの現地時刻での表示は夏時間の切り替えで
-- 1時間ずれる。また空き時間はコーチの生活の予定に合わせて変わる。そこで、コーチに14日ごとに
-- 空き時間を見直すようアプリ内通知で促す（メールは送らない。enqueue_notification_mail の対象外）。
--   - 空き時間が1件以上あるコーチ: 最後の確認（availability_confirmed_at）から14日を過ぎたら見直しを促す（kind = 'review'）
--   - 空き時間が0件のコーチ: 空き時間を登録するよう促す（kind = 'empty'。マッチングの申請を受けられないため）
--
-- 【通知の行】
-- 通知種別 COACH_AVAILABILITY_REMINDER、集約キー 'availability' の1行をコーチごとに使い回す
-- （再通知のたびに内容・未読・日時を更新する。一覧に同じ通知が溜まらない）。直近14日に通知した
-- コーチには出さない。空き時間を保存する・「変更なしで確認」すると、確認日時を更新し、この通知を既読にする。
--
-- 【対象のコーチ】
-- 有効なコーチ（com_m_user.user_type = '2' かつ delete_flg = '0'、プロフィールが有効）。デモコーチ
-- （demo_user ロール）は除く（通常の生徒のマッチング対象外のため。get_matchable_coach_ids と同じ考え方）。
---------------------------------------------

-- 確認日時の更新と、見直しの通知の既読化（空き時間の保存・「変更なしで確認」の共通処理。内部処理専用）
CREATE OR REPLACE FUNCTION public.fn_mark_coach_availability_confirmed(p_coach_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.com_m_coach_profile
    SET availability_confirmed_at = NOW()
    WHERE user_id = p_coach_id;

    UPDATE public.com_t_notification
    SET is_read = TRUE, read_at = NOW(), update_date = NOW()
    WHERE user_id = p_coach_id
      AND notification_type = 'COACH_AVAILABILITY_REMINDER'
      AND is_read = FALSE;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mark_coach_availability_confirmed(uuid) FROM PUBLIC, anon, authenticated;

-- 空き時間の追加・変更・削除（論理削除）のたびに確認済みにする
CREATE OR REPLACE FUNCTION public.trg_coach_availability_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.fn_mark_coach_availability_confirmed(NEW.coach_id);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_coach_availability_change_confirm ON public.com_m_coach_availability;
CREATE TRIGGER on_coach_availability_change_confirm
AFTER INSERT OR UPDATE ON public.com_m_coach_availability
FOR EACH ROW EXECUTE FUNCTION public.trg_coach_availability_confirmed();

-- 「変更なしで確認」（コーチ本人のみ）
CREATE OR REPLACE FUNCTION public.confirm_my_coach_availability()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_confirmed_at timestamptz;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.com_m_coach_profile WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'not authorized to confirm availability';
    END IF;

    PERFORM public.fn_mark_coach_availability_confirmed(auth.uid());

    SELECT availability_confirmed_at INTO v_confirmed_at FROM public.com_m_coach_profile WHERE user_id = auth.uid();
    RETURN v_confirmed_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_my_coach_availability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_my_coach_availability() TO authenticated;

-- 見直しの通知を登録する（pg_cron から毎日実行）。戻り値は通知したコーチの数
CREATE OR REPLACE FUNCTION public.enqueue_coach_availability_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH coaches AS (
        SELECT
            p.user_id AS coach_id,
            COUNT(a.availability_id) AS slot_count,
            -- 確認日時が無い（本機能の追加前から登録している）場合は、空き時間の最終更新を確認日時とみなす
            COALESCE(p.availability_confirmed_at, MAX(a.update_date)) AS confirmed_at
        FROM public.com_m_coach_profile p
        JOIN public.com_m_user u ON u.id = p.user_id AND u.user_type = '2' AND u.delete_flg = '0'
        LEFT JOIN public.com_m_coach_availability a ON a.coach_id = p.user_id AND a.delete_flg = '0'
        WHERE p.delete_flg = '0'
          AND NOT EXISTS (
              SELECT 1 FROM public.com_t_user_role r
              WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
          )
        GROUP BY p.user_id, p.availability_confirmed_at
    ),
    targets AS (
        SELECT c.coach_id, CASE WHEN c.slot_count = 0 THEN 'empty' ELSE 'review' END AS kind
        FROM coaches c
        WHERE (c.slot_count = 0 OR c.confirmed_at IS NULL OR c.confirmed_at < NOW() - interval '14 days')
          AND NOT EXISTS (
              SELECT 1 FROM public.com_t_notification n
              WHERE n.user_id = c.coach_id
                AND n.notification_type = 'COACH_AVAILABILITY_REMINDER'
                AND n.dedup_key = 'availability'
                AND n.occurred_at >= NOW() - interval '14 days'
          )
    ),
    upserted AS (
        INSERT INTO public.com_t_notification (user_id, notification_type, dedup_key, payload, link_path)
        SELECT coach_id, 'COACH_AVAILABILITY_REMINDER', 'availability', jsonb_build_object('kind', kind), '/availability'
        FROM targets
        ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE
        SET payload = EXCLUDED.payload,
            link_path = EXCLUDED.link_path,
            is_read = FALSE,
            read_at = NULL,
            occurred_at = NOW(),
            update_date = NOW()
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM upserted;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_coach_availability_reminders() FROM PUBLIC, anon, authenticated;

-- 毎日 00:15 UTC（日本 9:15、北米は前日の夕方）に実行する。同名ジョブは入れ替える（何度実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'coach-availability-reminders-daily';

SELECT cron.schedule(
    'coach-availability-reminders-daily',
    '15 0 * * *',
    $$ SELECT public.enqueue_coach_availability_reminders(); $$
);

COMMIT;

-- =========================================================================
-- 【追加セクション】グループセッションのシリーズをまとめて作成する（シリーズと回を1回で登録）
-- 追加日: 2026-10-07
--
-- 【内容】
--   1. admin_create_calendar_event_series(text, text, jsonb)（シリーズを作成し、回をまとめて登録）を新規作成
--      - 回の登録は admin_add_calendar_event_series_sessions に任せ、1件でも失敗したらシリーズも作らない
--
-- 対応ファイル: DDL/function/admin_create_calendar_event_series.sql
-- 【注意】アプリ（アドミンのシリーズの作成画面）が使うため、アプリのデプロイより先に適用すること。
--   「シリーズ」のセクション（admin_add_calendar_event_series_sessions）の適用後に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- admin_create_calendar_event_series: シリーズを作成し、回をまとめて登録する (2026-10-07 追加)
---------------------------------------------
-- アドミンの「シリーズの作成」（新規・このシリーズを元に作成）から呼ぶ（admin アプリのサーバーアクション、service_role）。
-- シリーズ（com_m_calendar_event_series）と各回・担当コーチを1つのトランザクションで登録し、
-- 途中で失敗した場合はシリーズも作らない（回の無いシリーズを残さない）。
-- 回の登録は admin_add_calendar_event_series_sessions に任せる（p_sessions の形式も同じ）。
--
-- 戻り値: 作成したシリーズのID
---------------------------------------------
DROP FUNCTION IF EXISTS public.admin_create_calendar_event_series(text, text, jsonb);

CREATE OR REPLACE FUNCTION public.admin_create_calendar_event_series(p_title text, p_description text, p_sessions jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_series_id uuid;
BEGIN
    IF NULLIF(btrim(p_title), '') IS NULL THEN
        RAISE EXCEPTION 'title_required';
    END IF;

    INSERT INTO public.com_m_calendar_event_series (event_type, title, description)
    VALUES ('GROUP_SESSION', btrim(p_title), NULLIF(btrim(p_description), ''))
    RETURNING series_id INTO v_series_id;

    PERFORM public.admin_add_calendar_event_series_sessions(v_series_id, p_sessions);

    RETURN v_series_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_calendar_event_series(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_calendar_event_series(text, text, jsonb) TO service_role;

COMMIT;
