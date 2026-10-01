---------------------------------------------
-- DML: com_m_company_profile (会社情報マスタ) 登録データ
-- 前提: DDL/table/com_m_company_profile.sql（2026-10-01 の法人コード追加パッチまで）,
-- DDL/storage/company_logo_bucket.sql の実行が完了していること。
-- 冪等性のため、法人ごとの固定IDの行をON CONFLICTで上書き更新する。
--
-- 【2026-09-13 更新】logo_pathをアプリのpublic配下の相対パス("/logo-01.png")から、
-- Storageバケット"company-logo"内の相対パス("logo-01.png")へ変更。アドミンが実ファイルを
-- アップロードして差し替えられるようにするため（詳細はcom_m_company_profile.sqlのコメント参照）。
--
-- 【2026-09-19 更新】コーチとの業務委託契約主体はバンクーバーオフィス（カナダ法人）であり、
-- 会社名・住所を日本本社(Gabby Academy Co., Ltd.)からバンクーバー法人(Global Vision
-- Technology Vancouver, Inc.)へ変更。tax_registration_numberは現時点で未確定のためNULL。
--
-- 【2026-10-01 更新】シングルトン運用を廃止し、法人ごとに1行を持つ。生徒向けトレーニング
-- レポートの発行元として日本法人(GABBY_JP、固定ID ...0002)を追加する。ロゴは当面両法人で共通。
-- 投入後の編集はアドミンの「システム設定 > 会社情報」画面から行う（本DMLを再実行すると
-- 画面で編集した内容は上書きされる点に注意）。
---------------------------------------------
INSERT INTO public.com_m_company_profile (company_profile_id, company_code, company_name, company_name_ja, address, logo_path, tax_registration_number) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'GVT_CA',
    'Global Vision Technology Vancouver, Inc.',
    NULL,
    '555 Burrard St' || E'\n' || 'Vancouver, BC V7X 1M8' || E'\n' || 'Canada',
    'logo-01.png',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'GABBY_JP',
    'Gabby Academy Co., Ltd.',
    '株式会社ギャビーアカデミー',
    '〒101-0041' || E'\n' || '東京都千代田区神田須田町2-25 GYB秋葉原2F',
    'logo-01.png',
    NULL
  )
ON CONFLICT (company_profile_id) DO UPDATE SET
  company_code = EXCLUDED.company_code,
  company_name = EXCLUDED.company_name,
  company_name_ja = EXCLUDED.company_name_ja,
  address = EXCLUDED.address,
  logo_path = EXCLUDED.logo_path,
  tax_registration_number = EXCLUDED.tax_registration_number,
  update_date = NOW();
