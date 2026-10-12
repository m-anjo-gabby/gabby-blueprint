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
