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
-- 【対象】（値の正本は packages/lib/mail/dispatch/registry.ts の NOTIFICATION_MAIL_TYPES。変更する場合は両方を直す）
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
