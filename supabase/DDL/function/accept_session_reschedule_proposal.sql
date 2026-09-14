---------------------------------------------
-- コーチ提案の振替候補を生徒が承諾するRPC (2026-09-07 追加)
-- 前提: table/com_t_session.sql, table/com_t_session_reschedule_proposal.sql の
--       作成が完了していること。
---------------------------------------------
-- 【背景】
-- cancel_session()でコーチが提案した候補時間(com_t_session_reschedule_proposal)を、
-- 生徒が承諾した際に呼ぶ。book_makeup_session()と同じく、キャンセルにより
-- ticket_refunded=trueとなった元セッションのschedule_id/ticket_idを使って
-- 新規セッションを作成するが、Availability(com_m_coach_availability)の
-- チェックは行わない（コーチが今回限りの特別な時間として明示的に提案した
-- ものであるため）。ただし二重予約防止のためのコーチ・生徒それぞれの
-- 予定重複チェックは、提案から承諾までに時間が空くことを考慮し、必ず行う。
--
-- 承諾された候補以外の、同一キャンセルに紐づく候補は自動的にdeclined化する
-- （生徒は複数候補のうち1つだけ選べる）。
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
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_reschedule_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    IF v_proposal.student_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
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

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.coach_id = v_session.coach_id
          AND s.status = 1
          AND s.start_datetime < v_proposal.proposed_end_datetime
          AND s.end_datetime > v_proposal.proposed_start_datetime
    ) THEN
        RAISE EXCEPTION 'coach already has a session at this time';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.student_id = v_session.student_id
          AND s.status = 1
          AND s.start_datetime < v_proposal.proposed_end_datetime
          AND s.end_datetime > v_proposal.proposed_start_datetime
    ) THEN
        RAISE EXCEPTION 'student already has a session at this time';
    END IF;

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

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_session_reschedule_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_session_reschedule_proposal(uuid) TO authenticated;
