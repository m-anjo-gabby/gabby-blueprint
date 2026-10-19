-- =========================================================================
-- com_m_session_pay_rate: セッションの単価
-- 登録データは DML/com_m_session_pay_rate.sql
-- =========================================================================
-- コーチ向けの支払通知書の支払額（単価 × 月のセッション数）に使う単価・通貨。全コーチ共通の単価のため1行だけで、
-- DML の固定ID（...0001）の行を投入・更新する。過去の単価は持たない。承認時点の単価は
-- com_t_coach_monthly_report_approval に固定して保存するため、単価の改定は未承認の月にだけ影響する。
-- 支払条件に関わる情報のため、参照・管理とも管理者のみ（コーチは承認の行に保存された値だけを見る）。
-- =========================================================================

-- @schema public.com_m_session_pay_rate
CREATE TABLE public.com_m_session_pay_rate (
    session_pay_rate_id      uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    rate_amount              numeric(10,2) NOT NULL,
    currency_code            text         NOT NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_session_pay_rate_positive CHECK (rate_amount >= 0::numeric)
);

COMMENT ON TABLE public.com_m_session_pay_rate IS 'セッション単価マスタ（全コーチ共通、現在値のみ保持。コーチ向け月次支払通知書PDFの支払額算出に使用）';
COMMENT ON COLUMN public.com_m_session_pay_rate.session_pay_rate_id IS '単価ID';
COMMENT ON COLUMN public.com_m_session_pay_rate.rate_amount IS '1セッションあたりの支払単価';
COMMENT ON COLUMN public.com_m_session_pay_rate.currency_code IS '通貨コード（例: CAD, USD, JPY）';
COMMENT ON COLUMN public.com_m_session_pay_rate.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_session_pay_rate.update_date IS '更新日時';

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_session_pay_rate FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_session_pay_rate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage session pay rate" ON public.com_m_session_pay_rate FOR ALL TO authenticated
USING (
    public.is_system_admin()
)
WITH CHECK (
    public.is_system_admin()
);
-- @end-schema
