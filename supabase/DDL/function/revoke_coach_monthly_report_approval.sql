---------------------------------------------
-- 月次コーチングレポート承認取消しRPC (2026-09-13 追加)
-- 前提: table/com_t_coach_monthly_report_approval.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- アドミンが承認後に誤りへ気付いた場合に、承認を取り消して未承認状態へ戻す。
-- コーチへの差し戻し（再申請を促す）フローではなく、単純な承認取消しのみ。
-- 取消し後は再度approve_coach_monthly_reportで承認し直すことを想定するため、
-- 承認時点のスナップショット（セッション集計・単価とも）はNULLへ戻す
-- （再承認時に最新値で作り直される）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_coach_monthly_report_approval(
    p_coach_id uuid,
    p_report_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month date := date_trunc('month', p_report_month)::date;
    v_approval RECORD;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to revoke this monthly report approval';
    END IF;

    SELECT * INTO v_approval
    FROM public.com_t_coach_monthly_report_approval
    WHERE coach_id = p_coach_id AND report_month = v_month
    FOR UPDATE;

    IF NOT FOUND OR v_approval.status <> 2 THEN
        RAISE EXCEPTION 'this monthly report is not approved';
    END IF;

    UPDATE public.com_t_coach_monthly_report_approval
    SET status = 1,
        session_count_snapshot = NULL,
        rate_amount = NULL,
        rate_currency = NULL,
        approved_by = NULL,
        approved_at = NULL,
        update_date = NOW()
    WHERE coach_id = p_coach_id AND report_month = v_month;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        p_coach_id,
        'COACH_REPORT_APPROVAL_REVOKED',
        jsonb_build_object('report_month', v_month),
        '/monthly-reports'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_coach_monthly_report_approval(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_coach_monthly_report_approval(uuid, date) TO authenticated;
