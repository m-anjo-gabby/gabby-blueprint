---------------------------------------------
-- DDL: com_m_country (国籍マスタ)
-- コーチプロフィールの国籍選択、および国旗アイコン表示に使用する。
---------------------------------------------
CREATE TABLE public.com_m_country (
  country_code text PRIMARY KEY, -- ISO 3166-1 alpha-2 (例: 'JP', 'US')
  name_en text NOT NULL,
  name_ja text NOT NULL,
  icon_path text, -- Storage "country-flag" バケット内の国旗アイコン画像パス
  sort_no smallint NOT NULL DEFAULT 1,
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

COMMENT ON TABLE public.com_m_country IS '国籍マスタ（コーチプロフィールの国籍選択・国旗表示用）';
COMMENT ON COLUMN public.com_m_country.country_code IS 'ISO 3166-1 alpha-2 国コード（例: JP, US）';
COMMENT ON COLUMN public.com_m_country.name_en IS '国名（英語表記、coachアプリ用）';
COMMENT ON COLUMN public.com_m_country.name_ja IS '国名（日本語表記、student/adminアプリ用）';
COMMENT ON COLUMN public.com_m_country.icon_path IS 'Storage内の国旗アイコン画像パス（"country-flag"バケット）';
COMMENT ON COLUMN public.com_m_country.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_country.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_country.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_country.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_country ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view countries" ON public.com_m_country;

CREATE POLICY "Anyone can view countries" ON public.com_m_country
FOR SELECT TO authenticated USING (delete_flg = '0');

-- 追加・更新・論理削除はAdmin Client（Service Role）経由のみを想定しており、
-- 一般ユーザー向けの更新系ポリシーは意図的に定義していない（RLSにより拒否される）。
