-- =========================================================================
-- create_session_booking_request: 生徒の自由予約リクエスト（未予約の回の予約の申請）
-- =========================================================================
-- 【役割】
-- 未予約の回（キャンセルで返還された回・元から予約されていない回）を、その枠（schedule_id）の担当コーチに予約を申請する。
-- コーチの空き時間に縛られず日時を選べる代わりに、必ずコーチの承認を要する（確定は approve_slot_proposal()）。
-- 本関数は com_t_session に直接書かず、com_t_session_slot_proposal に承認待ちの行を作る
-- （schedule_id 必須・source_session_id=NULL・proposed_by_role=1（生徒）・expires_at=NULL（期限なし））。
--
-- 【ルール】
-- - 予約できる回数は fn_schedule_bookable_count()（未予約の回から、自由予約リクエストと振替候補の回答待ちを差し引いた数）で
--   判定する（回答待ちの間に同じ回を重ねて申請し、両方の承認で契約の回数を超えるのを防ぐ）。
-- - 開始が24時間以上先の日時だけ（アドミンの代理予約 admin_book_session_direct は対象外）。
-- - ダブルブッキングは check_session_conflict() で確かめる。
-- - アドミンの代理実行は許可しない（アドミンは admin_book_session_direct を使う）ため、権限の判定は
--   fn_assert_actor_or_admin() を使わず生徒本人であることだけを確かめる。
--
-- 【通知】
-- コーチへ fn_notify() で通知する。リンク先は承認・却下ができるカレンダー（/calendar の Pending Requests）。
-- =========================================================================

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
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_request_id uuid;
    v_student_name text;
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
    IF p_start_datetime < NOW() + interval '24 hours' THEN
        RAISE EXCEPTION 'requested start datetime must be at least 24 hours from now';
    END IF;

    IF public.fn_schedule_bookable_count(p_schedule_id) <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_schedule.coach_id, v_schedule.student_id, p_start_datetime, p_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session_slot_proposal (
        schedule_id, source_session_id, student_id, coach_id, proposed_start_datetime, proposed_end_datetime,
        proposed_by_role, status, expires_at, reason
    ) VALUES (
        p_schedule_id, NULL, v_schedule.student_id, v_schedule.coach_id, p_start_datetime, p_end_datetime,
        1, 1, NULL, NULLIF(BTRIM(p_reason), '')
    )
    RETURNING proposal_id INTO v_request_id;

    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_schedule.student_id;
    PERFORM public.fn_notify(
        v_schedule.coach_id,
        'SESSION_BOOKING_REQUESTED',
        jsonb_build_object(
            'request_id', v_request_id,
            'student_name', v_student_name,
            'requested_start_datetime', p_start_datetime
        ),
        '/calendar'
    );

    RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) TO authenticated;
