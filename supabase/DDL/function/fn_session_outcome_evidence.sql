---------------------------------------------
-- 入退室ログからの実施結果の推定 共通ヘルパー関数
-- 前提: table/com_t_session_call_log.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 実施結果はコーチの申告で確定する（record_session_outcome）が、申告の初期値と確認の材料として
-- 入退室ログ（com_t_session_call_log）から結果を推定する。旧 finalize_session の自動判定と同じ規則:
--   ・コーチの入室記録が無い                → 推定なし（NULL。外部のZoom等、アプリの記録が無い）
--   ・コーチと生徒の在室の重なり20分以上     → 1:実施完了
--   ・20分未満だが生徒の入室記録がある       → 2:早期終了
--   ・生徒の入室記録が無い                   → 3:生徒の欠席
-- 退室が記録されていない区間（left_at IS NULL）は現在時刻までとして重なりを数える。
-- 権限の確認は呼び出し側（get_session_outcome_evidence / record_session_outcome /
-- admin_correct_session_outcome）で行う。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_session_outcome_evidence(p_session_id uuid)
RETURNS TABLE(suggested_outcome smallint, overlap_seconds integer, coach_joined boolean, student_joined boolean)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_overlap numeric;
    v_coach_joined boolean;
    v_student_joined boolean;
BEGIN
    SELECT COALESCE(SUM(GREATEST(0,
             EXTRACT(EPOCH FROM (LEAST(c.left_end, s.left_end) - GREATEST(c.joined_at, s.joined_at)))
           )), 0)
      INTO v_overlap
      FROM (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
              FROM public.com_t_session_call_log
              WHERE session_id = p_session_id AND role = 'coach') c
      CROSS JOIN (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
                    FROM public.com_t_session_call_log
                    WHERE session_id = p_session_id AND role = 'student') s;

    SELECT
        bool_or(l.role = 'coach') IS TRUE,
        bool_or(l.role = 'student') IS TRUE
      INTO v_coach_joined, v_student_joined
      FROM public.com_t_session_call_log l
      WHERE l.session_id = p_session_id;

    RETURN QUERY SELECT
        (CASE
            WHEN NOT v_coach_joined THEN NULL
            WHEN v_overlap >= 1200 THEN 1 -- 20分
            WHEN v_student_joined THEN 2
            ELSE 3
        END)::smallint,
        v_overlap::integer,
        v_coach_joined,
        v_student_joined;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_session_outcome_evidence(uuid) FROM PUBLIC, anon, authenticated;
