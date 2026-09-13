---------------------------------------------
-- 月次コーチングレポート: コーチ担当の有効契約生徒一覧RPC (2026-09-13 追加)
-- 前提: table/com_m_coach_student_relationship.sql, table/com_t_user_license.sql,
--       table/com_m_contract.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 月次コーチングレポートの縦軸（対象生徒）を決定する。「有効契約を持つ生徒」とは、
-- 対象月(p_report_month)の期間内のいずれかの時点で、ライセンス(status=1)・契約(status=1)
-- がともに有効だった生徒を指す。過去月を参照するケースがあるため、現在時刻基準
-- (now() between start/end) ではなく、対象月の範囲と契約期間が重なるかどうかで判定する
-- （getStudentOverviewCoreの「現在有効な契約」判定を月範囲版に一般化したもの）。
-- 担当関係(com_m_coach_student_relationship)はstatus不問（is_activeを問わない）で対象とする。
-- コーチ交代直後で当月分の実績が残っているケースを取りこぼさないため。
--
-- 【月範囲判定 (2026-09-13 コーチのタイムゾーン基準に修正)】
-- get_coach_monthly_sessions.sqlと同じ理由・同じ方式で、月の境界をUTCではなくコーチ自身の
-- タイムゾーン(com_m_user.timezone、呼び出しの都度DBから直接参照)を基準に判定する。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_monthly_active_students(p_coach_id uuid, p_report_month date)
RETURNS TABLE(student_id uuid, user_name text, icon_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_timezone text;
    v_month_start_utc timestamptz;
    v_month_end_utc timestamptz;
BEGIN
    IF auth.uid() <> p_coach_id AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to view this coach''s monthly report';
    END IF;

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo'; -- 対象コーチが存在しない場合のフォールバック（結果は0件になる）
    END IF;

    v_month_start_utc := date_trunc('month', p_report_month::timestamp) AT TIME ZONE v_coach_timezone;
    v_month_end_utc := (date_trunc('month', p_report_month::timestamp) + interval '1 month') AT TIME ZONE v_coach_timezone;

    RETURN QUERY
    SELECT DISTINCT u.id, u.user_name, u.icon_path
    FROM public.com_m_coach_student_relationship r
    JOIN public.com_m_user u ON u.id = r.student_id
    WHERE r.coach_id = p_coach_id
      AND EXISTS (
          SELECT 1
          FROM public.com_t_user_license l
          JOIN public.com_m_contract c ON c.contract_id = l.contract_id
          WHERE l.user_id = r.student_id
            AND l.status = 1
            AND c.status = 1
            AND l.start_date <= v_month_end_utc
            AND l.end_date >= v_month_start_utc
      )
    ORDER BY u.user_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_active_students(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_active_students(uuid, date) TO authenticated;
