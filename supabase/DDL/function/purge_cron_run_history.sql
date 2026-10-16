---------------------------------------------
-- purge_cron_run_history: pg_cron の実行記録の保管期限 (2026-10-09 追加)
---------------------------------------------
-- 前提: pg_cron 拡張が有効であること。
-- pg_cron は定期処理の実行ごとに cron.job_run_details へ1行を記録し、自動では消さない。毎分・5分ごとの処理があると
-- 1日に約1,700行（約0.45MB）ずつ増え、定期処理を足すほど増え方も大きくなるため、p_retention_days 日を過ぎた記録を消す。
-- 失敗の調査に使う期間として14日残す（定期処理の数が増えても、記録は直近14日分で頭打ちになる）。
-- pg_cron の毎日のジョブ 'cron-run-history-purge-daily'（03:45 JST）から呼ぶ。
-- 実行中の記録（end_time が NULL）は消さない。
-- 戻り値: 消した行の数
---------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION private.purge_cron_run_history(p_retention_days integer DEFAULT 14)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    DELETE FROM cron.job_run_details
    WHERE end_time < NOW() - make_interval(days => p_retention_days);
    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.purge_cron_run_history(integer) FROM PUBLIC, anon, authenticated;

-- 同名ジョブが既に存在する場合は入れ替える（何度再実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cron-run-history-purge-daily';

SELECT cron.schedule(
    'cron-run-history-purge-daily',
    '45 18 * * *',
    $$ SELECT private.purge_cron_run_history(); $$
);
