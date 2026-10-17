-- =========================================================================
-- com_t_coach_monthly_report_approval: コーチの月次レポート（Monthly Coaching Report）の承認
-- =========================================================================
-- 【役割】
-- コーチごと・月ごとのライブセッションの実施状況をアドミンが確認し、その月の稼働を確定させる記録。
-- 状態は 1:未承認 2:承認済み の2つで、アドミンが承認・承認の取り消しを行う（コーチからの申請は無い）。
-- (coach_id, report_month) ごとに最新の状態の1行だけを持ち、差し戻しの履歴は持たない。
--
-- 【スナップショット】
-- 承認時点のセッションの集計（session_count_snapshot）と単価・通貨を固定して保存する。承認後にセッションの
-- 記録や単価のマスタ（com_m_session_pay_rate）が変わっても、承認済みの表示と支払通知書の金額は変わらない。
-- 承認を取り消すと NULL に戻し、次の承認でその時点の値で作り直す。
--
-- 【書き込み・参照】
-- 承認・取り消しは approve_coach_monthly_report / revoke_coach_monthly_report_approval（SECURITY DEFINER、管理者専用）だけで行う。
-- 参照はコーチ本人と管理者。
-- =========================================================================

-- @schema public.com_t_coach_monthly_report_approval
CREATE TABLE public.com_t_coach_monthly_report_approval (
    approval_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    report_month             date         NOT NULL,
    status                   smallint     NOT NULL DEFAULT 1,
    session_count_snapshot   jsonb,
    approved_by              uuid         REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    approved_at              timestamp with time zone,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    rate_amount              numeric(10,2) DEFAULT NULL::numeric,
    rate_currency            text,
    CONSTRAINT com_t_coach_monthly_report_approval_coach_id_report_month_key UNIQUE (coach_id, report_month),
    CONSTRAINT chk_report_approval_status CHECK (status = ANY (ARRAY[1, 2]))
);

COMMENT ON TABLE public.com_t_coach_monthly_report_approval IS 'コーチ月次コーチングレポートの承認状態（アドミンが承認/承認取消しを行う。コーチからの申請概念は無い）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.approval_id IS '承認レコードID';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.coach_id IS '対象コーチのユーザID';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.report_month IS '対象年月（その月の1日で表現、例: 2026-09-01）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.status IS 'ステータス 1:未承認 2:承認済み';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.session_count_snapshot IS '承認時点のセッション集計スナップショット（承認取消し時にNULLへ戻す）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.approved_by IS '承認を行った管理者のユーザID';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.approved_at IS '承認日時';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.update_date IS '更新日時';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.rate_amount IS '承認時点のセッション単価スナップショット（com_m_session_pay_rateより。承認取消し時にNULLへ戻す）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.rate_currency IS '承認時点の通貨コードスナップショット（例: CAD）';

CREATE INDEX idx_coach_monthly_report_approval_coach ON public.com_t_coach_monthly_report_approval (coach_id, report_month);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_t_coach_monthly_report_approval FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_t_coach_monthly_report_approval ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and admin can view monthly report approval" ON public.com_t_coach_monthly_report_approval FOR SELECT TO authenticated
USING (
    coach_id = auth.uid() OR public.get_jwt_user_type() = '0'::text
);
-- @end-schema
