---------------------------------------------
-- 候補提案の却下/取り下げ応答RPC (2026-09-15 追加、reject_session_booking_request/
-- decline_session_reschedule_proposalsを統合)
-- 前提: table/com_t_session_slot_proposal.sql, function/fn_assert_actor_or_admin.sql の
--       作成が完了していること。
---------------------------------------------
-- 【背景】
-- 「応答する側が候補を却下する」処理を、approve_slot_proposal()と対になる形で統合する。
-- ただし却下の粒度は振替候補と自由予約リクエストで異なる（旧仕様をそのまま踏襲する）。
--   - 振替候補(source_session_id IS NOT NULL): 同一キャンセルに紐づくpendingな候補は
--     「いずれか1つを選ぶ」ための選択肢であり、個別に却下する意味が薄いため、
--     旧decline_session_reschedule_proposalsと同様にまとめて却下する。通知は行わない
--     （旧仕様のまま）。
--   - 自由予約リクエスト(source_session_id IS NULL): 旧reject_session_booking_requestと
--     同様、この1件のみを却下する。理由(p_reason)を記録し、生徒へSESSION_BOOKING_REJECTED
--     通知を送る。
-- 呼び出し元は対象となる候補のうちどれか1件のproposal_idを渡せばよく（振替候補の場合、
-- UIは特定の候補を選ばせず「まとめて却下」ボタンのみを提示するため、グループの先頭要素の
-- proposal_idを渡す想定）、本関数側でsource_session_id単位のグルーピングを解決する。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_slot_proposal(p_proposal_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
    v_responder_id uuid;
    v_coach_name text;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_slot_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    v_responder_id := CASE WHEN v_proposal.proposed_by_role = 2 THEN v_proposal.student_id ELSE v_proposal.coach_id END;
    PERFORM public.fn_assert_actor_or_admin(v_responder_id, 'not authorized to respond to this proposal');

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    IF v_proposal.source_session_id IS NOT NULL THEN
        UPDATE public.com_t_session_slot_proposal
        SET status = 3, responded_at = NOW(), update_date = NOW()
        WHERE source_session_id = v_proposal.source_session_id AND status = 1;
    ELSE
        UPDATE public.com_t_session_slot_proposal
        SET status = 3, reject_reason = p_reason, responded_at = NOW(), update_date = NOW()
        WHERE proposal_id = p_proposal_id;

        SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_proposal.coach_id;
        PERFORM public.fn_notify(
            v_proposal.student_id,
            'SESSION_BOOKING_REJECTED',
            jsonb_build_object('coach_name', v_coach_name, 'reject_reason', p_reason, 'requested_start_datetime', v_proposal.proposed_start_datetime),
            '/live-room'
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_slot_proposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_slot_proposal(uuid, text) TO authenticated;
