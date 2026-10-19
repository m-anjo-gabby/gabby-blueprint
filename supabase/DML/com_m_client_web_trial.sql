---------------------------------------------
-- DML: com_m_client（顧客マスタ）Webトライアルの固定の顧客
-- 前提: DDL/table/com_m_client.sql の実行が完了していること。
-- ID は全環境で同じ（web_trial_client_id() / packages/types/trialApplication.ts の WEB_TRIAL_CLIENT_ID）。
-- client_type 2 = 個人。冪等性のため、既存行は名前・種別だけ上書きする。
---------------------------------------------
INSERT INTO public.com_m_client (client_id, client_name, client_type) VALUES
  ('a7e1a100-0000-4000-8000-000000000001', 'Webトライアル', 2)
ON CONFLICT (client_id) DO UPDATE SET
  client_name = EXCLUDED.client_name,
  client_type = EXCLUDED.client_type,
  update_date = NOW();
