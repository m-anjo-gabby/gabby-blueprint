---------------------------------------------
-- コーチ提案の振替候補を生徒が却下するRPC (2026-09-07 追加)
-- 前提: table/com_t_session_reschedule_proposal.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 生徒が候補を明示的に却下した場合の記録用。却下しなくても回答期限(48時間)経過で
-- 自動的にexpired化されるため必須の操作ではないが、生徒が「この候補は無理」と
-- 意思表示できるようにするための任意アクション。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_session_reschedule_proposal(p_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_reschedule_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    IF v_proposal.student_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to respond to this proposal';
    END IF;

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    UPDATE public.com_t_session_reschedule_proposal
    SET status = 3, responded_at = NOW(), update_date = NOW()
    WHERE proposal_id = p_proposal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_session_reschedule_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_session_reschedule_proposal(uuid) TO authenticated;
