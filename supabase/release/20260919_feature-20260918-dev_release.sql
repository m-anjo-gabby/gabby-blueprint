-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260918-dev
-- 作成日: 2026-09-19
--
-- 【内容】
--   コーチ向け請求書(INVOICE)PDF機能への対応（アプリケーションコード側の変更が主、
--   本SQLはそれに伴うDBの変更のみ）。
--
--   1. com_m_company_profile に tax_registration_number 列を追加
--      - コーチがGST/HST登録事業者である場合の登録番号を印字するための任意項目。
--        既定はNULL（空欄運用）。
--   2. com_m_company_profile の登録データ（シングルトン1行）を、日本本社
--      (Gabby Academy Co., Ltd.) からコーチとの業務委託契約主体であるバンクーバー法人
--      (Global Vision Technology Vancouver, Inc.) へ変更
--      - 本テーブルはコーチ向け月次支払通知書・請求書PDFにのみ使用するため、契約実態に
--        合わせて名義を是正する（支払通知書側の表示もこれに伴い変更される）。
--
-- 対応ファイル: DDL/table/com_m_company_profile.sql（末尾の追加パッチ節）,
--   DML/com_m_company_profile.sql
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_m_company_profile: tax_registration_number列の追加
---------------------------------------------
ALTER TABLE public.com_m_company_profile
  ADD COLUMN IF NOT EXISTS tax_registration_number text DEFAULT NULL;

COMMENT ON TABLE public.com_m_company_profile IS '会社情報マスタ（コーチ向け月次支払通知書・請求書PDFに使用。運用上は常に1行のみ）';
COMMENT ON COLUMN public.com_m_company_profile.tax_registration_number IS '税務登録番号（例: カナダGST/HST登録番号）。未登録の場合はNULL（任意項目）';

---------------------------------------------
-- 2. com_m_company_profile: バンクーバー法人への名義変更
---------------------------------------------
INSERT INTO public.com_m_company_profile (company_profile_id, company_name, address, logo_path, tax_registration_number) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Global Vision Technology Vancouver, Inc.',
    '555 Burrard St' || E'\n' || 'Vancouver, BC V7X 1M8' || E'\n' || 'Canada',
    'logo-01.png',
    NULL
  )
ON CONFLICT (company_profile_id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  address = EXCLUDED.address,
  logo_path = EXCLUDED.logo_path,
  tax_registration_number = EXCLUDED.tax_registration_number,
  update_date = NOW();

COMMIT;
