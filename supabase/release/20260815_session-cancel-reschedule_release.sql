-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260814-dev
-- 作成日: 2026-08-15
--
-- 【内容】
--   専属コーチマッチング機能 Phase3: 個別セッションのキャンセル・振替RPC
--   前提: 20260815_live-session-matching_release.sql の適用が完了していること
--   （com_t_session, com_m_coach_availability, com_t_coach_availability_exception,
--     com_m_user の拡張ポリシー等に依存）。
--
--   1. cancel_session（生徒・コーチ共通: 個別セッションのキャンセル）
--   2. reschedule_session（生徒・コーチ共通: 個別セッションの振替/日時変更）
--
--   いずれも定期スケジュール(com_m_lesson_schedule)には触れず、対象の個別回
--   （com_t_session）のみを操作する。com_t_session への直接UPDATE/INSERTは
--   引き続きRLSで許可しないため、書き込みは必ずこの2関数を経由する。
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   再実行しても副作用がないよう、CREATE OR REPLACE FUNCTION で冪等に作成しています。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. cancel_session
-- =========================================================================
CREATE OR REPLACE FUNCTION public.cancel_session(p_session_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_new_status smallint;
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

    v_new_status := CASE WHEN v_session.student_id = auth.uid() THEN 3 ELSE 4 END;

    UPDATE public.com_t_session
    SET status = v_new_status, cancel_reason = p_reason, cancelled_by = auth.uid(), update_date = NOW()
    WHERE session_id = p_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text) TO authenticated;

-- =========================================================================
-- 2. reschedule_session
-- =========================================================================
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

COMMIT;
