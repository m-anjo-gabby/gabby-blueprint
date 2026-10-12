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
