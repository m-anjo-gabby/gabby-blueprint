---------------------------------------------
-- 予約リクエストをコーチが承認するRPC (2026-09-11 追加)
-- 前提: table/com_t_session_booking_request.sql, table/com_t_session.sql,
--       function/check_session_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- create_session_booking_request()で生徒が作成したリクエストを、担当コーチが承認する。
-- リクエスト作成時にもcheck_session_conflict()でチェック済みだが、リクエストから
-- 承認までに時間が空くことを考慮し、承認時にも再チェックする。
--
-- 【24時間ルールは承認時に再チェックしない (2026-09-15追加)】
-- create_session_booking_request()はリクエスト作成時点で「開始24時間以上先」を
-- 検証済みだが、本関数（承認）ではあえて再検証しない。再検証してしまうと、
-- 生徒が(例えば)25時間後のリクエストを作成しても、コーチが1時間以内に承認しないと
-- 通らなくなり、「相手が即応答しない限り成立しない」という不合理なルールになって
-- しまうため。24時間ルールは「申請・提案した時点で妥当な時間を指定したか」を
-- 検証するものであり、相手の応答速度を制約するものではない、という整理とする。
--
-- 【権限チェック・通知の共通化 (2026-09-15追加)】
-- 権限チェックはfn_assert_actor_or_admin()、通知INSERTはfn_notify()を使う
-- （前提: function/fn_assert_actor_or_admin.sql, function/fn_notify.sql）。
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
    v_coach_name text;
BEGIN
    SELECT * INTO v_request FROM public.com_t_session_booking_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to respond to this booking request');

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

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'SESSION_BOOKING_APPROVED',
        jsonb_build_object(
            'request_id', p_request_id,
            'session_id', v_new_session_id,
            'coach_name', v_coach_name,
            'session_start_datetime', v_request.requested_start_datetime
        ),
        '/live-room'
    );

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_session_booking_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_session_booking_request(uuid) TO authenticated;
