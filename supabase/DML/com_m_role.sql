---------------------------------------------
-- DML: com_m_role（ロールマスタ）登録データ
-- 前提: DDL/table/com_m_role.sql の実行が完了していること。
-- ロールを増やす場合はここに追記し、リリーススクリプトにも同じ行を入れる（管理画面は無い。
-- 付与は admin のユーザー編集で、target_user_type が一致する種別（NULL は全種別）のユーザーに行う）。
-- target_user_type: '0' 管理者 / '1' 生徒 / '2' コーチ / NULL 共通。
-- 冪等性のため、既存行は ON CONFLICT で上書き更新する。
--
-- ロールの意味:
--   admin           … システム管理者（admin アプリの全機能）
--   content_manager … 教材担当者（admin アプリの教材管理）
--   monitor         … モニター（student アプリで同じ顧客の受講生の学習状況を見る）
--   demo_user       … デモユーザー（デモのコーチは、デモの生徒の「専属コーチを探す」にだけ出る）
--   web_trial_coach … Webトライアル担当（Webトライアルのプランの生徒の「専属コーチを探す」には、このロールのコーチだけが出る。
--                     通常の生徒の一覧にも出る。判定は get_matchable_coach_ids()）
---------------------------------------------
INSERT INTO public.com_m_role (role_id, role_name, target_user_type, seq_no) VALUES
  ('admin', 'システム管理者', '0', 1),
  ('monitor', 'モニター', '1', 1),
  ('content_manager', '教材担当者', '0', 2),
  ('demo_user', 'デモユーザー', NULL, 2),
  ('web_trial_coach', 'Webトライアル担当', '2', 3)
ON CONFLICT (role_id) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  target_user_type = EXCLUDED.target_user_type,
  seq_no = EXCLUDED.seq_no;
