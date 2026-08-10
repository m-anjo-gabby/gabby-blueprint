---------------------------------------------
-- DML: com_m_country (国籍マスタ) 登録データ
-- 前提: DDL/table/com_m_country.sql の実行が完了していること。
-- 冪等性のため、既存行は ON CONFLICT で上書き更新する。
--
-- country_code は ISO 3166-1 alpha-2（2桁）を標準とする。
-- ただし Scotland は ISO 3166-1 に国として存在しない（UKのサブディビジョン）ため、
-- ISO 3166-2:GB のサブディビジョンコードである 'SCT' を用いる（例外的に3桁）。
--
-- icon_path は Storage "country-flag" バケット直下のファイル名（例: 'AU.png'）。
-- 既存の3桁ファイル名（AUS.png 等）からのリネームが必要（下記対応表を参照）。
--   AUS.png -> AU.png
--   CAN.png -> CA.png
--   COL.png -> CO.png
--   GBR.png -> GB.png
--   IRL.png -> IE.png
--   JPN.png -> JP.png
--   NZL.png -> NZ.png
--   SCO.png -> SCT.png
--   USA.png -> US.png
--   ZAF.png -> ZA.png
---------------------------------------------
INSERT INTO public.com_m_country (country_code, name_en, name_ja, icon_path, sort_no) VALUES
  ('AU',  'Australia',       'オーストラリア',   'AU.png',  1),
  ('CA',  'Canada',          'カナダ',           'CA.png',  2),
  ('CO',  'Colombia',        'コロンビア',       'CO.png',  3),
  ('GB',  'United Kingdom',  'イギリス',         'GB.png',  4),
  ('IE',  'Ireland',         'アイルランド',     'IE.png',  5),
  ('JP',  'Japan',           '日本',             'JP.png',  6),
  ('NZ',  'New Zealand',     'ニュージーランド', 'NZ.png',  7),
  ('SCT', 'Scotland',        'スコットランド',   'SCT.png', 8),
  ('US',  'United States',   'アメリカ合衆国',   'US.png',  9),
  ('ZA',  'South Africa',    '南アフリカ',       'ZA.png',  10)
ON CONFLICT (country_code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ja = EXCLUDED.name_ja,
  icon_path = EXCLUDED.icon_path,
  sort_no = EXCLUDED.sort_no,
  update_date = now();
