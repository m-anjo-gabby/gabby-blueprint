---------------------------------------------
-- 予約リクエストをコーチが却下するRPC (2026-09-11 追加)
-- 前提: table/com_t_session_booking_request.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- create_session_booking_request()で生徒が作成したリクエストを、担当コーチが却下する。
-- 却下してもチケットは未割当のまま残り、生徒は別日時で再度リクエストできる。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_session_booking_request(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
BEGIN
    SELECT * INTO v_request FROM public.com_t_session_booking_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking request % not found', p_request_id;
    END IF;

    IF v_request.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to respond to this booking request';
    END IF;

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'this booking request is no longer pending (status=%)', v_request.status;
    END IF;

    UPDATE public.com_t_session_booking_request
    SET status = 3, reject_reason = NULLIF(BTRIM(p_reason), ''), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    SELECT
        v_request.student_id,
        'SESSION_BOOKING_REJECTED',
        jsonb_build_object(
            'request_id', p_request_id,
            'coach_name', u.user_name,
            'reject_reason', p_reason,
            'requested_start_datetime', v_request.requested_start_datetime
        ),
        '/live-room'
    FROM public.com_m_user u WHERE u.id = v_request.coach_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_session_booking_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_session_booking_request(uuid, text) TO authenticated;
