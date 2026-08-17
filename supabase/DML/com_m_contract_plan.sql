---------------------------------------------
-- DML: com_m_contract_plan (契約プランマスタ) 登録データ
-- 前提: DDL/table/com_m_contract_plan.sql の実行が完了していること。
-- 冪等性のため、既存行は ON CONFLICT で上書き更新する。
---------------------------------------------
INSERT INTO public.com_m_contract_plan (plan_code, plan_name, contract_type, weekly_frequency, period_months, total_sessions, sort_no) VALUES
  ('BLUEPRINT_ONLY',   'Blueprintのみ',                1, NULL, 3, NULL, 1),
  ('LIVE_WEEKLY1_3M',  'ライブ週1回（3か月・全12回）', 2, 1,    3, 12,   2),
  ('LIVE_WEEKLY2_3M',  'ライブ週2回（3か月・全24回）', 2, 2,    3, 24,   3)
ON CONFLICT (plan_code) DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  contract_type = EXCLUDED.contract_type,
  weekly_frequency = EXCLUDED.weekly_frequency,
  period_months = EXCLUDED.period_months,
  total_sessions = EXCLUDED.total_sessions,
  sort_no = EXCLUDED.sort_no,
  update_date = NOW();
