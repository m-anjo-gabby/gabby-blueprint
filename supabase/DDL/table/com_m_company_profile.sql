---------------------------------------------
-- DDL: com_m_company_profile (会社情報マスタ) (2026-09-13 追加)
---------------------------------------------
-- 【背景】
-- コーチ向け月次支払通知書(PDF)に印字する会社名・住所・ロゴを管理する。
-- 運用上は常に1行のみ（シングルトン）を想定し、固定ID
-- ('00000000-0000-0000-0000-000000000001')の行をDML(supabase/DML/com_m_company_profile.sql)
-- で投入・更新する。アドミン画面からの更新もこの固定IDの行をUPDATEするのみで、
-- INSERT/DELETEは行わない。
--
-- 【参照経路】
-- 会社名・住所・契約条件に類する情報のため、com_m_contract_planと同様に参照・管理ともに
-- 管理者のみ許可する。コーチ向け支払通知書PDFの生成はサーバー側のRoute Handlerが
-- createAdminClient()(service_role)経由で読むため、コーチ自身にSELECT権限を与える必要はない。
---------------------------------------------
CREATE TABLE public.com_m_company_profile (
    company_profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name text NOT NULL,
    address text NOT NULL,
    logo_path text,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_company_profile IS '会社情報マスタ（コーチ向け月次支払通知書PDFに使用。運用上は常に1行のみ）';
COMMENT ON COLUMN public.com_m_company_profile.company_profile_id IS '会社情報ID';
COMMENT ON COLUMN public.com_m_company_profile.company_name IS '会社名（例: Gabby Academy Co., Ltd.）';
COMMENT ON COLUMN public.com_m_company_profile.address IS '住所（PDF印字用、複数行は改行区切り）';
COMMENT ON COLUMN public.com_m_company_profile.logo_path IS 'ロゴ画像のパス（Storageバケット"company-logo"内の相対パス、例: logo-01.png。前提: storage/company_logo_bucket.sqlの実行完了）';
COMMENT ON COLUMN public.com_m_company_profile.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_company_profile.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_company_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage company profile" ON public.com_m_company_profile;

CREATE POLICY "Admins can manage company profile" ON public.com_m_company_profile
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

---------------------------------------------
-- 追加パッチ: コーチ向け請求書(INVOICE)対応 (2026-09-19 追加)
---------------------------------------------
-- 【背景】
-- 従来は「コーチ向け月次支払通知書PDF」専用のテーブルだったが、アドミンが会計記録用に
-- 発行する請求書(INVOICE)PDFでも同じ会社情報（コーチとの業務委託契約主体である
-- バンクーバー法人）を表示するため、用途を「コーチ向け書面（支払通知書・請求書）全般」に
-- 拡張する。テーブル構造・シングルトン運用（固定ID1行のみ）は変更しない。
--
-- tax_registration_numberは、コーチがGST/HST登録事業者である場合の登録番号を印字するための
-- 任意項目。多くの個人契約コーチは非登録（小規模事業者免除）と想定されるため、既定はNULLとし
-- 空欄運用とする。登録要否・記載要件はカナダの税務専門家に確認の上、必要な場合のみアドミンが
-- 手動設定する。
---------------------------------------------
ALTER TABLE public.com_m_company_profile
  ADD COLUMN IF NOT EXISTS tax_registration_number text DEFAULT NULL;

COMMENT ON TABLE public.com_m_company_profile IS '会社情報マスタ（コーチ向け月次支払通知書・請求書PDFに使用。運用上は常に1行のみ）';
COMMENT ON COLUMN public.com_m_company_profile.tax_registration_number IS '税務登録番号（例: カナダGST/HST登録番号）。未登録の場合はNULL（任意項目）';
