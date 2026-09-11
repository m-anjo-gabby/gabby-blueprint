---------------------------------------------
-- 未消化チケットによる新規予約リクエストRPC (2026-09-11 追加、book_makeup_sessionを置き換え)
-- 前提: table/com_m_lesson_schedule.sql, table/com_t_session.sql,
--       table/com_t_session_booking_request.sql, function/fn_schedule_shortfall.sql,
--       function/check_session_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- キャンセルによりticket_refunded=trueとなり未割当に戻ったチケット（週n回契約の
-- うち一部コマ）や、元々未割当のチケットを、そのコマの担当コーチ限定で予約する。
-- 旧book_makeup_session()はコーチのAvailability範囲内であれば即時確定していたが、
-- Availability制約を撤廃し自由に日時を選べるようにする代わりに、必ずコーチの承認を
-- 要するようにする（ダブルブッキング以外の「コーチの実際の都合」は承認ステップで
-- 担保する）。そのため本関数はcom_t_sessionへ直接INSERTせず、
-- com_t_session_booking_requestへpending行を作成するのみで、確定は
-- approve_session_booking_request()が行う。
--
-- 対象コーチは com_m_lesson_schedule.coach_id で既に確定しているため、本関数は
-- コーチ選択を受け付けず、スケジュール(コマ)IDのみを受け取る。
-- shortfall(未割当チケット数)のチェックでは、既にpending中の他リクエストも
-- 暫定的に消費済みとみなし、同一コマへの過剰リクエストを防止する。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.create_session_booking_request(
    p_schedule_id uuid,
    p_start_datetime timestamptz,
    p_end_datetime timestamptz,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_shortfall integer;
    v_pending_count integer;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_request_id uuid;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.student_id <> auth.uid() THEN
        RAISE EXCEPTION 'not authorized to request a booking for this schedule';
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'lesson schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    IF p_end_datetime <= p_start_datetime THEN
        RAISE EXCEPTION 'invalid proposed time range';
    END IF;
    IF p_start_datetime <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    SELECT shortfall INTO v_shortfall FROM public.fn_schedule_shortfall(p_schedule_id);

    SELECT COUNT(*) INTO v_pending_count
    FROM public.com_t_session_booking_request r
    WHERE r.schedule_id = p_schedule_id AND r.status = 1;

    IF v_shortfall - v_pending_count <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_schedule.coach_id, v_schedule.student_id, p_start_datetime, p_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session_booking_request (
        schedule_id, student_id, coach_id, requested_start_datetime, requested_end_datetime, reason
    ) VALUES (
        p_schedule_id, v_schedule.student_id, v_schedule.coach_id, p_start_datetime, p_end_datetime, NULLIF(BTRIM(p_reason), '')
    )
    RETURNING request_id INTO v_request_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    SELECT
        v_schedule.coach_id,
        'SESSION_BOOKING_REQUESTED',
        jsonb_build_object(
            'request_id', v_request_id,
            'student_name', u.user_name,
            'requested_start_datetime', p_start_datetime
        ),
        '/students/' || v_schedule.student_id
    FROM public.com_m_user u WHERE u.id = v_schedule.student_id;

    RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) TO authenticated;
