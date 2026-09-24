---------------------------------------------
-- DML: com_m_company_profile (会社情報マスタ) 登録データ
-- 前提: DDL/table/com_m_company_profile.sql, DDL/storage/company_logo_bucket.sql の実行が
-- 完了していること。冪等性のため、固定IDの行をON CONFLICTで上書き更新する（シングルトン運用）。
--
-- 【2026-09-13 更新】logo_pathをアプリのpublic配下の相対パス("/logo-01.png")から、
-- Storageバケット"company-logo"内の相対パス("logo-01.png")へ変更。アドミンが実ファイルを
-- アップロードして差し替えられるようにするため（詳細はcom_m_company_profile.sqlのコメント参照）。
--
-- 【2026-09-19 更新】コーチとの業務委託契約主体はバンクーバーオフィス（カナダ法人）であり、
-- 会社名・住所を日本本社(Gabby Academy Co., Ltd.)からバンクーバー法人(Global Vision
-- Technology Vancouver, Inc.)へ変更。本テーブルはコーチ向け月次支払通知書・請求書(INVOICE)
-- PDFにのみ使用するため（DDL側コメント参照）、対象書面の名義を契約実態に合わせる。
-- tax_registration_numberは現時点で未確定のためNULL（任意項目、詳細はDDL側コメント参照）。
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
