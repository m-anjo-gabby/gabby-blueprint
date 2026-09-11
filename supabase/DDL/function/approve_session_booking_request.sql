---------------------------------------------
-- 予約リクエストをコーチが承認するRPC (2026-09-11 追加)
-- 前提: table/com_t_session_booking_request.sql, table/com_t_session.sql,
--       function/check_session_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- create_session_booking_request()で生徒が作成したリクエストを、担当コーチが承認する。
-- リクエスト作成時にもcheck_session_conflict()でチェック済みだが、リクエストから
-- 承認までに時間が空くことを考慮し、承認時にも再チェックする。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_session_booking_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_schedule RECORD;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_new_session_id uuid;
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

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = v_request.schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', v_request.schedule_id;
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_request.coach_id, v_request.student_id, v_request.requested_start_datetime, v_request.requested_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
    ) VALUES (
        v_schedule.schedule_id, v_schedule.ticket_id, v_request.student_id, v_request.coach_id,
        v_request.requested_start_datetime, v_request.requested_end_datetime, 1
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session_booking_request
    SET status = 2, responded_at = NOW(), resulting_session_id = v_new_session_id, update_date = NOW()
    WHERE request_id = p_request_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    SELECT
        v_request.student_id,
        'SESSION_BOOKING_APPROVED',
        jsonb_build_object(
            'request_id', p_request_id,
            'session_id', v_new_session_id,
            'coach_name', u.user_name,
            'session_start_datetime', v_request.requested_start_datetime
        ),
        '/live-room'
    FROM public.com_m_user u WHERE u.id = v_request.coach_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_session_booking_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_session_booking_request(uuid) TO authenticated;
