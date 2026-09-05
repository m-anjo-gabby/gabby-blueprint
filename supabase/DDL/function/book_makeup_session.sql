---------------------------------------------
-- 未割当チケットによる新規セッション予約RPC (2026-09-05 追加)
-- 前提: table/com_m_lesson_schedule.sql, table/com_t_session.sql,
--       table/com_m_coach_availability.sql, table/com_t_coach_availability_exception.sql,
--       function/fn_schedule_shortfall.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- キャンセルによりticket_refunded=trueとなり未割当に戻ったチケット（週n回契約の
-- うち一部コマ）を、そのコマの担当コーチ限定で再予約するためのRPC。
-- 対象コーチは com_m_lesson_schedule.coach_id で既に確定しているため、本関数は
-- コーチ選択を受け付けず、スケジュール(コマ)IDのみを受け取る。
-- reschedule_session() と同じ空き時間・重複チェックのパターンを流用するが、
-- 元になる既存セッション行が無い（新規に枠を使う）点が異なる。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.book_makeup_session(
    p_schedule_id uuid,
    p_new_date date,
    p_new_start_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_shortfall integer;
    v_duration interval;
    v_new_start timestamptz;
    v_new_end timestamptz;
    v_new_end_time time;
    v_day_of_week smallint;
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.student_id <> auth.uid() AND v_schedule.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to book a session for this schedule';
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'lesson schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    SELECT shortfall INTO v_shortfall FROM public.fn_schedule_shortfall(p_schedule_id);
    IF v_shortfall <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    v_duration := v_schedule.end_time - v_schedule.start_time;
    v_new_start := (p_new_date + p_new_start_time) AT TIME ZONE v_schedule.coach_timezone;
    v_new_end := v_new_start + v_duration;
    v_new_end_time := p_new_start_time + v_duration;
    v_day_of_week := EXTRACT(DOW FROM p_new_date)::smallint;

    IF v_new_start <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_availability a
        WHERE a.coach_id = v_schedule.coach_id
          AND a.day_of_week = v_day_of_week
          AND a.delete_flg = '0'
          AND a.start_time <= p_new_start_time
          AND a.end_time >= v_new_end_time
    ) THEN
        RAISE EXCEPTION 'requested time is outside coach availability';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_availability_exception e
        WHERE e.coach_id = v_schedule.coach_id
          AND e.exception_date = p_new_date
          AND e.exception_type = 'BLOCK'
          AND e.start_time < v_new_end_time
          AND e.end_time > p_new_start_time
    ) THEN
        RAISE EXCEPTION 'requested date is blocked by coach exception';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.coach_id = v_schedule.coach_id
          AND s.status = 1
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'coach already has a session at this time';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.student_id = v_schedule.student_id
          AND s.status = 1
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'student already has a session at this time';
    END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
    ) VALUES (
        v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
        v_new_start, v_new_end, 1
    )
    RETURNING session_id INTO v_new_session_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_makeup_session(uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_makeup_session(uuid, date, time) TO authenticated;
