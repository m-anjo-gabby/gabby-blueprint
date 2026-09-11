---------------------------------------------
-- セッションの日時変更（アドミン代理操作専用）RPC (2026-09-11 追加)
-- 前提: table/com_t_session.sql, function/check_session_conflict.sql の作成が
--       完了していること。
---------------------------------------------
-- 【背景】
-- 「振替」という生徒・コーチ向けの独立概念は廃止し、cancel_session()+
-- create_session_booking_request()/accept_session_reschedule_proposal()の2ステップに
-- 置き換えたが（reschedule_session()は削除）、アドミンのライブセッション管理画面は
-- 既に人間同士（管理者・コーチ・生徒）で直接調整済みの内容を即時反映するための
-- ツールであり、承認ステップを挟む必要がない。旧reschedule_session()のアドミン代理
-- 分岐が担っていた「Availability・12時間ルールを免除し、ダブルブッキングのみ
-- チェックして即時に新規行を作る」という挙動を、アドミン専用の本関数として維持する。
-- 呼び出しはget_jwt_user_type()='0'（管理者）のみ許可する。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reschedule_session(
    p_session_id uuid,
    p_new_start_datetime timestamptz,
    p_new_end_datetime timestamptz,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_new_session_id uuid;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to reschedule this session';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF p_new_end_datetime <= p_new_start_datetime THEN
        RAISE EXCEPTION 'invalid proposed time range';
    END IF;
    IF p_new_start_datetime <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_session.coach_id, v_session.student_id, p_new_start_datetime, p_new_end_datetime, p_session_id);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_session.schedule_id, v_session.ticket_id, v_session.student_id, v_session.coach_id,
        p_new_start_datetime, p_new_end_datetime, 1, p_session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session
    SET status = 5, cancel_reason = p_reason, cancelled_by = auth.uid(), update_date = NOW()
    WHERE session_id = p_session_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES
        (v_session.student_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'new_session_id', v_new_session_id, 'session_start_datetime', p_new_start_datetime), '/live-room'),
        (v_session.coach_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'new_session_id', v_new_session_id, 'session_start_datetime', p_new_start_datetime), '/students/' || v_session.student_id);

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reschedule_session(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reschedule_session(uuid, timestamptz, timestamptz, text) TO authenticated;
