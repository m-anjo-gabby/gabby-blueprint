---------------------------------------------
-- 振替候補を一括却下するRPC (2026-09-11 追加、decline_session_reschedule_proposalを置き換え)
-- 前提: table/com_t_session_reschedule_proposal.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 候補はそもそも「いずれか1つを選んで承諾する」ための選択肢であり、候補単位で
-- 個別に却下する意味は薄い。UI側もキャンセル（提案全体）に対して単一の却下ボタンに
-- 統一するため、同一セッションに紐づくpendingな候補をまとめて却下する本関数に置き換える
-- （旧 decline_session_reschedule_proposal(uuid) は廃止。DROPはcancel_session.sql参照）。
-- 却下しなくても回答期限(24時間)経過で自動的にexpired化されるため必須の操作ではないが、
-- 応答者が「今回はいずれも無理」と意思表示できるようにするための任意アクション。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_session_reschedule_proposals(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_any RECORD;
    v_responder_id uuid;
BEGIN
    SELECT * INTO v_any FROM public.com_t_session_reschedule_proposal
    WHERE session_id = p_session_id AND status = 1
    LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no pending proposals for session %', p_session_id;
    END IF;

    -- 提案者と逆側（proposed_by_role=2:コーチ提案なら生徒、1:生徒提案ならコーチ）のみ却下できる
    v_responder_id := CASE WHEN v_any.proposed_by_role = 2 THEN v_any.student_id ELSE v_any.coach_id END;
    IF v_responder_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to respond to this proposal';
    END IF;

    UPDATE public.com_t_session_reschedule_proposal
    SET status = 3, responded_at = NOW(), update_date = NOW()
    WHERE session_id = p_session_id AND status = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_session_reschedule_proposals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_session_reschedule_proposals(uuid) TO authenticated;
