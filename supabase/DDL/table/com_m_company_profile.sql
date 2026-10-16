-- =========================================================================
-- com_m_company_profile: 会社情報（書面に印字する法人ごとの情報）
-- 登録データは DML/com_m_company_profile.sql
-- =========================================================================
-- 【役割】
-- 法人ごとに1行（company_code: GVT_CA = バンクーバー法人 / GABBY_JP = 日本法人）。
-- コーチ向けの書面（支払通知書・請求書）はコーチと業務委託契約を結ぶバンクーバー法人、
-- 生徒向けのトレーニングレポートは顧客と契約する日本法人の名義で発行する。
-- どの書面をどの法人の名義にするかはアプリ側の定数（packages/types/companyProfile.ts の DOCUMENT_ISSUER）で決める。
-- 行は DML の固定ID（...0001 = GVT_CA、...0002 = GABBY_JP）で作り、アドミンの「システム設定 > 会社情報」では
-- 既存の行の更新だけを行う。
--
-- 【参照できる範囲】
-- 参照・管理とも管理者のみ。書面の PDF はサーバー側で service_role を使って読むため、コーチに権限は要らない。
--
-- 【tax_registration_number】
-- コーチ向け書面に印字する GST/HST の登録番号。必要な場合だけアドミンが設定する（既定は NULL）。
-- =========================================================================

-- @schema public.com_m_company_profile
CREATE TABLE public.com_m_company_profile (
    company_profile_id       uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name             text         NOT NULL,
    address                  text         NOT NULL,
    logo_path                text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    tax_registration_number  text,
    company_code             text         NOT NULL,
    company_name_ja          text
);

COMMENT ON TABLE public.com_m_company_profile IS '会社情報マスタ（法人ごとに1行。書面の発行元として使用。コーチ向け支払通知書・請求書=GVT_CA、生徒向けトレーニングレポート=GABBY_JP）';
COMMENT ON COLUMN public.com_m_company_profile.company_profile_id IS '会社情報ID';
COMMENT ON COLUMN public.com_m_company_profile.company_name IS '会社名（英語。例: Gabby Academy Co., Ltd.）';
COMMENT ON COLUMN public.com_m_company_profile.address IS '住所（PDF印字用、複数行は改行区切り）';
COMMENT ON COLUMN public.com_m_company_profile.logo_path IS 'ロゴ画像のパス（apps/coach/public配下の相対パス、例: /logo-01.png）';
COMMENT ON COLUMN public.com_m_company_profile.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_company_profile.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_company_profile.tax_registration_number IS '税務登録番号（例: カナダGST/HST登録番号）。未登録の場合はNULL（任意項目）';
COMMENT ON COLUMN public.com_m_company_profile.company_code IS '法人コード（GVT_CA: バンクーバー法人 / GABBY_JP: 日本法人）。一意';
COMMENT ON COLUMN public.com_m_company_profile.company_name_ja IS '会社名（日本語。例: 株式会社ギャビーアカデミー）。日本法人の書面で英語名と併記する。任意';

CREATE UNIQUE INDEX uq_company_profile_code ON public.com_m_company_profile (company_code);

ALTER TABLE public.com_m_company_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage company profile" ON public.com_m_company_profile FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    public.get_jwt_user_type() = '0'::text
);
-- @end-schema
