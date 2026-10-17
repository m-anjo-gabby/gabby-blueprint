-- =========================================================================
-- com_m_country: 国（コーチの国籍・国旗）
-- 登録データは DML/com_m_country.sql
-- =========================================================================
-- 国旗の画像は Storage の country-flag バケット。追加・更新・削除は service_role だけで行う（使わなくなった国は is_active = false にする）（更新系のポリシーは意図的に作っていない）。
-- =========================================================================

-- @schema public.com_m_country
CREATE TABLE public.com_m_country (
    country_code             text         PRIMARY KEY,
    name_en                  text         NOT NULL,
    name_ja                  text         NOT NULL,
    icon_path                text,
    sort_no                  smallint     NOT NULL DEFAULT 1,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    is_active                boolean      NOT NULL DEFAULT true
);

COMMENT ON TABLE public.com_m_country IS '国籍マスタ（コーチプロフィールの国籍選択・国旗表示用）';
COMMENT ON COLUMN public.com_m_country.country_code IS 'ISO 3166-1 alpha-2 国コード（例: JP, US）';
COMMENT ON COLUMN public.com_m_country.name_en IS '国名（英語表記、coachアプリ用）';
COMMENT ON COLUMN public.com_m_country.name_ja IS '国名（日本語表記、student/adminアプリ用）';
COMMENT ON COLUMN public.com_m_country.icon_path IS 'Storage内の国旗アイコン画像パス（"country-flag"バケット）';
COMMENT ON COLUMN public.com_m_country.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_country.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_country.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_country.is_active IS '使用中（国の選択肢に出す）';

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_country FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_country ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view countries" ON public.com_m_country FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
