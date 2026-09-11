---------------------------------------------
-- 提案された振替候補を、提案者と逆側が承諾するRPC (2026-09-07 追加、2026-09-11双方向化)
-- 前提: table/com_t_session.sql, table/com_t_session_reschedule_proposal.sql,
--       function/check_session_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- cancel_session()で提案された候補時間(com_t_session_reschedule_proposal)を、
-- 提案者と逆側の当事者（コーチ提案なら生徒、生徒提案ならコーチ）が承諾した際に呼ぶ。
-- キャンセルによりticket_refunded=trueとなった元セッションのschedule_id/ticket_idを
-- 使って新規セッションを作成するが、Availability(com_m_coach_availability)の
-- チェックは行わない（一回限りの特別な時間として明示的に提案されたものであるため）。
-- ただし二重予約防止のためのコーチ・生徒それぞれの予定重複チェックは、提案から承諾
-- までに時間が空くことを考慮し、check_session_conflict()で必ず行う。
--
-- 承諾された候補以外の、同一キャンセルに紐づく候補は自動的にdeclined化する
-- （応答者は複数候補のうち1つだけ選べる）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_session_reschedule_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
    v_session RECORD;
    v_responder_id uuid;
    v_new_session_id uuid;
    v_coach_conflict boolean;
    v_student_conflict boolean;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_reschedule_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    -- 提案者と逆側（proposed_by_role=2:コーチ提案なら生徒、1:生徒提案ならコーチ）のみ承諾できる
    v_responder_id := CASE WHEN v_proposal.proposed_by_role = 2 THEN v_proposal.student_id ELSE v_proposal.coach_id END;
    IF v_responder_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to respond to this proposal';
    END IF;

    IF v_proposal.status = 4 OR (v_proposal.status = 1 AND v_proposal.expires_at <= NOW()) THEN
        UPDATE public.com_t_session_reschedule_proposal SET status = 4, update_date = NOW() WHERE proposal_id = p_proposal_id AND status = 1;
        RAISE EXCEPTION 'this proposal has expired';
    END IF;

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = v_proposal.session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'original session % not found', v_proposal.session_id;
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_session.coach_id, v_session.student_id, v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_session.schedule_id, v_session.ticket_id, v_session.student_id, v_session.coach_id,
        v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime, 1, v_proposal.session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session_reschedule_proposal
    SET status = 2, responded_at = NOW(), resulting_session_id = v_new_session_id, update_date = NOW()
    WHERE proposal_id = p_proposal_id;

    -- 同じキャンセルに紐づく他の候補（まだpendingのもの）は自動的に不採用にする
    UPDATE public.com_t_session_reschedule_proposal
    SET status = 3, responded_at = NOW(), update_date = NOW()
    WHERE session_id = v_proposal.session_id
      AND proposal_id <> p_proposal_id
      AND status = 1;

    -- 承諾したのが生徒ならコーチへ、コーチならば生徒へ通知する
    IF v_responder_id = v_session.student_id THEN
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        SELECT
            v_session.coach_id,
            'SESSION_BOOKED_BY_STUDENT',
            jsonb_build_object(
                'session_id', v_new_session_id,
                'student_name', u.user_name,
                'session_start_datetime', v_proposal.proposed_start_datetime
            ),
            '/students/' || v_session.student_id
        FROM public.com_m_user u WHERE u.id = v_session.student_id;
    ELSE
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        SELECT
            v_session.student_id,
            'SESSION_BOOKING_APPROVED',
            jsonb_build_object(
                'session_id', v_new_session_id,
                'coach_name', u.user_name,
                'session_start_datetime', v_proposal.proposed_start_datetime
            ),
            '/live-room'
        FROM public.com_m_user u WHERE u.id = v_session.coach_id;
    END IF;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_session_reschedule_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_session_reschedule_proposal(uuid) TO authenticated;
