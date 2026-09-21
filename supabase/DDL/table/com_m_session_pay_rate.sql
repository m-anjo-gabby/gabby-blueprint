---------------------------------------------
-- DDL: com_m_session_pay_rate (セッション単価マスタ) (2026-09-13 追加)
---------------------------------------------
-- 【背景】
-- コーチ向け月次支払通知書(PDF)の支払額(単価 × 月間総セッション数)算出に使う
-- セッション単価・通貨を管理する。現時点では全コーチ共通の単一の単価のため、
-- コーチ別の行は持たず、常に1行のみ（シングルトン）を想定する。固定ID
-- ('00000000-0000-0000-0000-000000000001')の行をDML(supabase/DML/com_m_session_pay_rate.sql)
-- で投入・更新する。変更履歴（過去の単価）は持たない。承認時点の単価は
-- com_t_coach_monthly_report_approval.rate_amount/rate_currencyにスナップショットとして
-- 固定保存するため、本マスタの改定は未承認の月にのみ影響する。
--
-- 【参照経路】
-- 支払条件に関わる機微な情報のため、com_m_contract_planと同様に参照・管理ともに
-- 管理者のみ許可する。coachはcom_t_coach_monthly_report_approvalに固定保存された
-- 値のみを参照し、本マスタへ直接アクセスすることはない。
---------------------------------------------
CREATE TABLE public.com_m_session_pay_rate (
    session_pay_rate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_amount numeric(10, 2) NOT NULL,
    currency_code text NOT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_pay_rate_positive CHECK (rate_amount >= 0)
);

COMMENT ON TABLE public.com_m_session_pay_rate IS 'セッション単価マスタ（全コーチ共通、現在値のみ保持。コーチ向け月次支払通知書PDFの支払額算出に使用）';
COMMENT ON COLUMN public.com_m_session_pay_rate.session_pay_rate_id IS '単価ID';
COMMENT ON COLUMN public.com_m_session_pay_rate.rate_amount IS '1セッションあたりの支払単価';
COMMENT ON COLUMN public.com_m_session_pay_rate.currency_code IS '通貨コード（例: CAD, USD, JPY）';
COMMENT ON COLUMN public.com_m_session_pay_rate.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_session_pay_rate.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_session_pay_rate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage session pay rate" ON public.com_m_session_pay_rate;

CREATE POLICY "Admins can manage session pay rate" ON public.com_m_session_pay_rate
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');
