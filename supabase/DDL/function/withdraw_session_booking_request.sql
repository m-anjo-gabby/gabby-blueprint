---------------------------------------------
-- 予約リクエストを生徒本人が取り下げるRPC (2026-09-11 追加)
-- 前提: table/com_t_session_slot_proposal.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチの応答を待たずに、生徒が自分のpending中のリクエストを取り下げたい場合の経路。
-- 取り下げてもチケットは未割当のまま残り、別日時で再度リクエストできる。
--
-- 【権限チェックの共通化 (2026-09-15追加)】
-- fn_assert_actor_or_admin()を使う（前提: function/fn_assert_actor_or_admin.sql）。
--
-- 【スロット提案の統合 (2026-09-15追加)】
-- 対象テーブルをcom_t_session_booking_requestからcom_t_session_slot_proposalへ変更する。
-- withdraw（提案者本人による取り下げ）は現行仕様どおり自由予約リクエスト
-- (source_session_id IS NULL)のみに適用し、キャンセル時の振替候補には適用しない
-- （DB制約chk_slot_proposal_withdraw_scopeでも機械的に担保している）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_session_booking_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
BEGIN
    SELECT * INTO v_request FROM public.com_t_session_slot_proposal WHERE proposal_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking request % not found', p_request_id;
    END IF;

    IF v_request.source_session_id IS NOT NULL THEN
        RAISE EXCEPTION 'reschedule proposals cannot be withdrawn; wait for a response or expiry';
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.student_id, 'not authorized to withdraw this booking request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'this booking request is no longer pending (status=%)', v_request.status;
    END IF;

    UPDATE public.com_t_session_slot_proposal
    SET status = 4, responded_at = NOW(), update_date = NOW()
    WHERE proposal_id = p_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.withdraw_session_booking_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_session_booking_request(uuid) TO authenticated;
