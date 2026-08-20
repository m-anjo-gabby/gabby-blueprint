---------------------------------------------
-- 個別セッションの振替/日時変更RPC (2026-08-15 追加, Phase3)
-- 前提: table/com_t_session.sql, table/com_m_coach_availability.sql,
--       table/com_t_coach_availability_exception.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 生徒・コーチいずれかが、確定済みの個別セッション1回分の日時のみを変更する。
-- 対象は必ず同一コーチ・同一生徒（同一schedule_id）内に限定し、元のセッションは
-- status=5(rescheduled)として残し、新しいセッション行を生成して置き換える
-- （振替の追跡・監査のため物理更新ではなく新規行方式を採る）。
-- 定期スケジュール(com_m_lesson_schedule)の基本パターンには一切触れない。
--
-- 【日時の指定方法】
-- クライアントからは新しい日付(date)と、コーチのローカル時刻としての開始時刻(time)を
-- 受け取る（マッチング申請時と同じ考え方）。絶対時刻への変換とタイムゾーン、
-- 空き時間・重複チェックはすべてサーバー側(本関数内)で行う。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_session(
    p_session_id uuid,
    p_new_date date,
    p_new_start_time time,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_coach_tz text;
    v_duration interval;
    v_new_start timestamptz;
    v_new_end timestamptz;
    v_new_end_time time;
    v_day_of_week smallint;
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.student_id <> auth.uid() AND v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to reschedule this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime <= NOW() THEN
        RAISE EXCEPTION 'cannot reschedule a session that has already started';
    END IF;

    SELECT timezone INTO v_coach_tz FROM public.com_m_user WHERE id = v_session.coach_id;
    v_coach_tz := COALESCE(v_coach_tz, 'Asia/Tokyo');

    v_duration := v_session.end_datetime - v_session.start_datetime;
    v_new_start := (p_new_date + p_new_start_time) AT TIME ZONE v_coach_tz;
    v_new_end := v_new_start + v_duration;
    v_new_end_time := p_new_start_time + v_duration;
    v_day_of_week := EXTRACT(DOW FROM p_new_date)::smallint;

    IF v_new_start <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_availability a
        WHERE a.coach_id = v_session.coach_id
          AND a.day_of_week = v_day_of_week
          AND a.delete_flg = '0'
          AND a.start_time <= p_new_start_time
          AND a.end_time >= v_new_end_time
    ) THEN
        RAISE EXCEPTION 'requested time is outside coach availability';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_availability_exception e
        WHERE e.coach_id = v_session.coach_id
          AND e.exception_date = p_new_date
          AND e.exception_type = 'BLOCK'
          AND e.start_time < v_new_end_time
          AND e.end_time > p_new_start_time
    ) THEN
        RAISE EXCEPTION 'requested date is blocked by coach exception';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.coach_id = v_session.coach_id
          AND s.status = 1
          AND s.session_id <> p_session_id
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'coach already has a session at this time';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.student_id = v_session.student_id
          AND s.status = 1
          AND s.session_id <> p_session_id
          AND s.start_datetime < v_new_end
          AND s.end_datetime > v_new_start
    ) THEN
        RAISE EXCEPTION 'student already has a session at this time';
    END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_session.schedule_id, v_session.ticket_id, v_session.student_id, v_session.coach_id,
        v_new_start, v_new_end, 1, p_session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session
    SET status = 5, cancel_reason = p_reason, cancelled_by = auth.uid(), update_date = NOW()
    WHERE session_id = p_session_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reschedule_session(uuid, date, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_session(uuid, date, time, text) TO authenticated;
