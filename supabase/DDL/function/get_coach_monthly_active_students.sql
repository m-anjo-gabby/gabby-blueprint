---------------------------------------------
-- 月次コーチングレポート: 縦軸の生徒一覧RPC
-- 前提: table/com_m_coach_student_relationship.sql, table/com_t_user_license.sql,
--       table/com_m_contract.sql, function/get_coach_monthly_sessions.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 月次コーチングレポートの縦軸（対象生徒）を決定する。次のどちらかに当たる生徒を返す。
-- 1. 担当の生徒のうち、対象月(p_report_month)の期間内のいずれかの時点で、ライセンス(status=1)・契約(status=1)
--    がともに有効だった生徒。過去月を参照するケースがあるため、現在時刻基準 (now() between start/end) ではなく、
--    対象月の範囲と契約期間が重なるかどうかで判定する。担当関係(com_m_coach_student_relationship)は
--    status不問（is_activeを問わない）で対象とする。コーチ交代直後で当月分の実績が残っているケースを取りこぼさないため。
-- 2. 対象月にこのコーチとの実績に数えるセッション・終了処理未実施のセッションがある生徒
--    （get_coach_monthly_sessions の行がある生徒）。月の途中でライセンスを停止した・契約を解約した生徒の
--    実施済みのセッションも、画面の合計・承認のスナップショット・支払額に同じく入れるため。
--
-- 【月範囲判定】
-- get_coach_monthly_sessions.sqlと同じ理由・同じ方式で、月の境界をUTCではなくコーチ自身の
-- タイムゾーン(com_m_user.timezone、呼び出しの都度DBから直接参照)を基準に判定する。
--
-- 【権限チェックの共通化】
-- fn_assert_actor_or_admin()を使う（前提: function/fn_assert_actor_or_admin.sql）。
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
    PERFORM public.fn_assert_actor_or_admin(p_coach_id, 'not authorized to view this coach''s monthly report');

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo'; -- 対象コーチが存在しない場合のフォールバック（結果は0件になる）
    END IF;

    v_month_start_utc := date_trunc('month', p_report_month::timestamp) AT TIME ZONE v_coach_timezone;
    v_month_end_utc := (date_trunc('month', p_report_month::timestamp) + interval '1 month') AT TIME ZONE v_coach_timezone;

    RETURN QUERY
    SELECT u.id, u.user_name, u.icon_path
    FROM public.com_m_user u
    WHERE u.id IN (
        SELECT r.student_id
        FROM public.com_m_coach_student_relationship r
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
        UNION
        SELECT s.student_id
        FROM public.get_coach_monthly_sessions(p_coach_id, p_report_month) s
    )
    ORDER BY u.user_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_active_students(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_active_students(uuid, date) TO authenticated;
