---------------------------------------------
-- 候補提案の承諾/承認RPC (2026-09-15 追加、approve_session_booking_request/
-- accept_session_reschedule_proposalを統合)
-- 前提: table/com_t_session_slot_proposal.sql, function/check_session_conflict.sql,
--       function/fn_assert_actor_or_admin.sql, function/fn_notify.sql の作成が
--       完了していること。
---------------------------------------------
-- 【背景】
-- 「相手が提案した候補日時を、応答する側が承諾/承認してセッションを確定する」という
-- 処理は、振替候補(旧com_t_session_reschedule_proposal)・自由予約リクエスト
-- (旧com_t_session_booking_request)のいずれでも本質的に同一だった
-- （旧approve_session_booking_request/accept_session_reschedule_proposalは
-- 「応答できるのは提案者と逆側のみ」「対象がpendingであること」「コーチ・生徒
-- それぞれの二重予約チェック」「com_t_session新規作成」という骨格が完全に一致していた）。
-- 統合テーブルcom_t_session_slot_proposal.proposed_by_role（1:生徒提案 2:コーチ提案）を
-- 使い、応答者を「提案者と逆側」として一般化する。自由予約リクエストはproposed_by_role=1
-- 固定（DB制約chk_slot_proposal_booking_roleで保証）のため、この式は常に「コーチが応答」に
-- なり、旧approve_session_booking_requestの「コーチのみ応答可」という挙動と自然に一致する。
--
-- 【有効期限】
-- expires_atが設定されている場合（振替候補）のみ期限切れ判定を行う。自由予約リクエストは
-- expires_at IS NULL（無期限）のため対象外のまま。
--
-- 【同一キャンセル起因の他候補の自動不採用】
-- source_session_idが設定されている場合（振替候補）のみ、同じキャンセルに紐づく他の
-- pending候補を自動的に不採用(declined)にする。自由予約リクエストはsource_session_id
-- IS NULLのため、この処理は1件も対象にならず無害（元々グルーピングの概念が無いため）。
--
-- 【通知】
-- 応答した側と逆（＝提案者）へ、採用されたことを通知する。生徒が応答した場合はコーチへ
-- SESSION_BOOKED_BY_STUDENT、コーチが応答した場合は生徒へSESSION_BOOKING_APPROVEDを送る
-- （自由予約リクエストの承認は常に後者に該当し、旧approve_session_booking_requestの
-- 通知内容と一致する）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_slot_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
    v_schedule RECORD;
    v_responder_id uuid;
    v_new_session_id uuid;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_counterpart_name text;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_slot_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    -- 提案者と逆側（proposed_by_role=2:コーチ提案なら生徒、1:生徒提案ならコーチ）のみ応答できる
    v_responder_id := CASE WHEN v_proposal.proposed_by_role = 2 THEN v_proposal.student_id ELSE v_proposal.coach_id END;
    PERFORM public.fn_assert_actor_or_admin(v_responder_id, 'not authorized to respond to this proposal');

    IF v_proposal.status = 1 AND v_proposal.expires_at IS NOT NULL AND v_proposal.expires_at <= NOW() THEN
        UPDATE public.com_t_session_slot_proposal SET status = 5, update_date = NOW() WHERE proposal_id = p_proposal_id AND status = 1;
        RAISE EXCEPTION 'this proposal has expired';
    END IF;

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = v_proposal.schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', v_proposal.schedule_id;
    END IF;

    -- 提案から応答までに時間が空くことを考慮し、二重予約チェックは改めて必ず行う
    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_proposal.coach_id, v_proposal.student_id, v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime, v_proposal.source_session_id);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_proposal.schedule_id, v_schedule.ticket_id, v_proposal.student_id, v_proposal.coach_id,
        v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime, 1, v_proposal.source_session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session_slot_proposal
    SET status = 2, responded_at = NOW(), resulting_session_id = v_new_session_id, update_date = NOW()
    WHERE proposal_id = p_proposal_id;

    IF v_proposal.source_session_id IS NOT NULL THEN
        UPDATE public.com_t_session_slot_proposal
        SET status = 3, responded_at = NOW(), update_date = NOW()
        WHERE source_session_id = v_proposal.source_session_id
          AND proposal_id <> p_proposal_id
          AND status = 1;
    END IF;

    IF v_responder_id = v_proposal.student_id THEN
        SELECT user_name INTO v_counterpart_name FROM public.com_m_user WHERE id = v_proposal.student_id;
        PERFORM public.fn_notify(
            v_proposal.coach_id,
            'SESSION_BOOKED_BY_STUDENT',
            jsonb_build_object('session_id', v_new_session_id, 'student_name', v_counterpart_name, 'session_start_datetime', v_proposal.proposed_start_datetime),
            '/students/' || v_proposal.student_id
        );
    ELSE
        SELECT user_name INTO v_counterpart_name FROM public.com_m_user WHERE id = v_proposal.coach_id;
        PERFORM public.fn_notify(
            v_proposal.student_id,
            'SESSION_BOOKING_APPROVED',
            jsonb_build_object('session_id', v_new_session_id, 'coach_name', v_counterpart_name, 'session_start_datetime', v_proposal.proposed_start_datetime),
            '/live-room'
        );
    END IF;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_slot_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_slot_proposal(uuid) TO authenticated;
