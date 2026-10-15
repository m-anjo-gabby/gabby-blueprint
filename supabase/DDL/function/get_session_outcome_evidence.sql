---------------------------------------------
-- ライブセッションの実施結果の推定の取得RPC (2026-10-14 追加)
-- 前提: function/fn_session_outcome_evidence.sql, function/fn_assert_actor_or_admin.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチの End Session ダイアログ・アドミンの結果の修正ダイアログを開いた時に、入退室ログからの推定
-- （初期選択にする結果）と根拠（コーチ・生徒の入室の有無、在室の重なり）を表示するために使う。
-- com_t_session_call_log はコーチ・生徒どちらも自分の関わる行を読めるが、重なりの計算を
-- 記録時（record_session_outcome）と同じ関数に揃えるためRPCにする。
-- 担当コーチ本人またはアドミンのみ。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_session_outcome_evidence(p_session_id uuid)
RETURNS TABLE(suggested_outcome smallint, overlap_seconds integer, coach_joined boolean, student_joined boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_id uuid;
BEGIN
    SELECT s.coach_id INTO v_coach_id FROM public.com_t_session s WHERE s.session_id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_coach_id, 'not authorized to view this session');

    RETURN QUERY SELECT * FROM public.fn_session_outcome_evidence(p_session_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_session_outcome_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_session_outcome_evidence(uuid) TO authenticated;
