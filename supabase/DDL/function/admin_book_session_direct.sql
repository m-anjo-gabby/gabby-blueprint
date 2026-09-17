---------------------------------------------
-- 未消化チケットによる新規セッション予約（アドミン代理操作専用）RPC (2026-09-11 追加)
-- 前提: table/com_m_lesson_schedule.sql, table/com_t_session.sql,
--       function/check_session_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 生徒・コーチ向けの新規予約(create_session_booking_request→approve_session_booking_request)は
-- コーチの承認を要するようにしたが（Availability制約撤廃の代わりの安全弁）、アドミンの
-- ライブセッション管理画面は既に人間同士で直接調整済みの内容を即時反映するツールであり、
-- 承認ステップを挟む必要がない。旧book_makeup_session()のアドミン代理分岐が担っていた
-- 「Availabilityを免除し、ダブルブッキングのみチェックして即時にセッション行を作る」という
-- 挙動を、アドミン専用の本関数として維持する。呼び出しはget_jwt_user_type()='0'（管理者）
-- のみ許可する。
--
-- 【権限チェック・通知の共通化 (2026-09-15追加)】
-- 権限チェックはfn_assert_actor_or_admin()、通知INSERTはfn_notify()を使う
-- （前提: function/fn_assert_actor_or_admin.sql, function/fn_notify.sql）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_book_session_direct(
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
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_new_session_id uuid;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to book a session for this schedule');

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
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

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_schedule.coach_id, v_schedule.student_id, p_start_datetime, p_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
    ) VALUES (
        v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
        p_start_datetime, p_end_datetime, 1
    )
    RETURNING session_id INTO v_new_session_id;

    PERFORM public.fn_notify(v_schedule.student_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', v_new_session_id, 'session_start_datetime', p_start_datetime), '/live-room');
    PERFORM public.fn_notify(v_schedule.coach_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', v_new_session_id, 'session_start_datetime', p_start_datetime), '/students/' || v_schedule.student_id);

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_book_session_direct(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_book_session_direct(uuid, timestamptz, timestamptz, text) TO authenticated;
