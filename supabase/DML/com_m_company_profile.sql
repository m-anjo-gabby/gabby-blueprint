---------------------------------------------
-- DML: com_m_company_profile (会社情報マスタ) 登録データ
-- 前提: DDL/table/com_m_company_profile.sql, DDL/storage/company_logo_bucket.sql の実行が
-- 完了していること。冪等性のため、固定IDの行をON CONFLICTで上書き更新する（シングルトン運用）。
--
-- 【2026-09-13 更新】logo_pathをアプリのpublic配下の相対パス("/logo-01.png")から、
-- Storageバケット"company-logo"内の相対パス("logo-01.png")へ変更。アドミンが実ファイルを
-- アップロードして差し替えられるようにするため（詳細はcom_m_company_profile.sqlのコメント参照）。
---------------------------------------------
INSERT INTO public.com_m_company_profile (company_profile_id, company_name, address, logo_path) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Gabby Academy Co., Ltd.',
    '2-25-2F, Kandasudacho, Chiyoda-ku' || E'\n' || 'Tokyo Japan 101-0041',
    'logo-01.png'
  )
ON CONFLICT (company_profile_id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  address = EXCLUDED.address,
  logo_path = EXCLUDED.logo_path,
  update_date = NOW();
