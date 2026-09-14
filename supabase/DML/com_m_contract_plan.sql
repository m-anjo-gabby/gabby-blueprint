---------------------------------------------
-- DML: com_m_contract_plan (契約プランマスタ) 登録データ
-- 前提: DDL/table/com_m_contract_plan.sql の実行が完了していること。
-- 冪等性のため、既存行は ON CONFLICT で上書き更新する。
--
-- 【2026-09-08 更新】プラン英語名・ダイアログプラクティス提供有無を追加。
-- plan_codeは既存契約からの参照が変わらないよう変更しない（表示名のみ変更）。
---------------------------------------------
INSERT INTO public.com_m_contract_plan (plan_code, plan_name, plan_name_en, contract_type, weekly_frequency, period_months, total_sessions, has_dialogue_practice, sort_no) VALUES
  ('BLUEPRINT_ONLY',   'アプリのみ',       'App only',                 1, NULL, 3, NULL, false, 1),
  ('LIVE_WEEKLY1_3M',  'スピーキング強化', 'Standard',                 2, 1,    3, 12,   false, 2),
  ('LIVE_WEEKLY2_3M',  'ビジネス英語プロ', 'Business Pro (Dialogue)',  2, 2,    3, 24,   true,  3)
ON CONFLICT (plan_code) DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  plan_name_en = EXCLUDED.plan_name_en,
  contract_type = EXCLUDED.contract_type,
  weekly_frequency = EXCLUDED.weekly_frequency,
  period_months = EXCLUDED.period_months,
  total_sessions = EXCLUDED.total_sessions,
  has_dialogue_practice = EXCLUDED.has_dialogue_practice,
  sort_no = EXCLUDED.sort_no,
  update_date = NOW();
