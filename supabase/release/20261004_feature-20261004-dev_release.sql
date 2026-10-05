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
