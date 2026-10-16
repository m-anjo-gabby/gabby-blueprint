---------------------------------------------
-- Webトライアルの申込者が所属する固定の顧客のID
---------------------------------------------
-- 全環境で同じIDの顧客「Webトライアル」（supabase/DML/com_m_client_web_trial.sql）に、申込者を常に所属させる
-- （月ごと等に顧客を増やさない）。アプリ側の同じ値は packages/types/trialApplication.ts の WEB_TRIAL_CLIENT_ID。
-- 変更する場合は両方を直す。
CREATE OR REPLACE FUNCTION public.web_trial_client_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'a7e1a100-0000-4000-8000-000000000001'::uuid $$;

COMMENT ON FUNCTION public.web_trial_client_id() IS 'Webトライアルの申込者が所属する固定の顧客のID';
