---------------------------------------------
-- ライブセッション通話 入室記録RPC (2026-09-04 追加)
-- 前提: table/com_t_session_call_log.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- com_t_session_call_logへの直接INSERTはRLSで許可していない（SELECTのみ許可）ため、
-- 通話ルームへの入室（初回・再接続とも）は必ず本関数を通す。joined_atはパラメータで
-- 受け取らず、DEFAULT NOW()のみで確定させることでクライアントからの時刻偽装を防ぐ。
-- 対象セッションのstatusによる制限は設けない（レッスン終了操作後の再入室・遅延接続
-- 等でも記録自体は許可し、finalize_session側のガードで判定の一貫性を担保する）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.record_session_call_join(p_session_id uuid, p_zoom_session_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_role text;
    v_call_log_id uuid;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id = auth.uid() THEN
        v_role := 'coach';
    ELSIF v_session.student_id = auth.uid() THEN
        v_role := 'student';
    ELSE
        RAISE EXCEPTION 'not authorized to join this session';
    END IF;

    INSERT INTO public.com_t_session_call_log (session_id, user_id, role, zoom_session_id)
    VALUES (p_session_id, auth.uid(), v_role, p_zoom_session_id)
    RETURNING call_log_id INTO v_call_log_id;

    RETURN v_call_log_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_session_call_join(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_session_call_join(uuid, text) TO authenticated;
