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
