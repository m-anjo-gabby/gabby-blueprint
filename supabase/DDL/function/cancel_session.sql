---------------------------------------------
-- 個別セッションのキャンセルRPC (2026-08-15 追加, Phase3)
-- 前提: table/com_t_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- com_t_session への直接UPDATEはRLSで許可していない（SELECTのみ許可）ため、
-- 生徒・コーチいずれかによるセッションのキャンセルは必ず本関数を通す。
-- 定期スケジュール(com_m_lesson_schedule)には触れず、対象の個別回のみを
-- キャンセル済みにする（＝「定期スケジュールは基本的に維持」）。
-- チケットの消化(used_sessions)は実施完了時にのみ加算される想定のため、
-- 事前キャンセルではチケットを一切消費しない。
--
-- 【チケット返還ルール (2026-09-05追加)】
-- 生徒キャンセル: 開始12時間以上前ならticket_refunded=true（未割当扱いに戻り、
--   担当コーチ限定で再予約可能）、12時間未満ならfalse（返還なし、消化済み扱い）。
-- コーチキャンセル: 時間帯を問わず常にticket_refunded=true。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_session(p_session_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_new_status smallint;
    v_refunded boolean;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.student_id <> auth.uid() AND v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to cancel this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime <= NOW() THEN
        RAISE EXCEPTION 'cannot cancel a session that has already started';
    END IF;

    IF v_session.student_id = auth.uid() THEN
        v_new_status := 3;
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_new_status := 4;
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = v_new_status, cancel_reason = p_reason, cancelled_by = auth.uid(),
        ticket_refunded = v_refunded, update_date = NOW()
    WHERE session_id = p_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text) TO authenticated;
