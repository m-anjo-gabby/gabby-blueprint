---------------------------------------------
-- DML: com_m_session_pay_rate (セッション単価マスタ) 登録データ
-- 前提: DDL/table/com_m_session_pay_rate.sql の実行が完了していること。
-- 冪等性のため、固定IDの行をON CONFLICTで上書き更新する（シングルトン運用）。
---------------------------------------------
INSERT INTO public.com_m_session_pay_rate (session_pay_rate_id, rate_amount, currency_code) VALUES
  ('00000000-0000-0000-0000-000000000001', 15.00, 'CAD')
ON CONFLICT (session_pay_rate_id) DO UPDATE SET
  rate_amount = EXCLUDED.rate_amount,
  currency_code = EXCLUDED.currency_code,
  update_date = NOW();
