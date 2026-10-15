---------------------------------------------
-- ライブセッションの実施結果の反映 共通ヘルパー関数 (2026-10-14 追加)
-- 前提: table/com_t_session.sql（2026-10-14パッチ）, table/com_t_session_outcome_history.sql,
--       function/fn_consume_session_ticket.sql, function/fn_restore_session_ticket.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチの記録（record_session_outcome）とアドミンの修正（admin_correct_session_outcome）は、
-- 「結果（SESSION_OUTCOME）を com_t_session の列へ写す」「チケットの消化・返還の差分を反映する」
-- 「履歴を残す」が同じ処理になるため、ここに集約する。権限・入力の確認と通知は呼び出し側で行う。
--
-- 【結果と記録の対応】
--   1:実施完了 / 2:生徒の都合で早く終了 / 3:生徒の欠席
--      → status=2, completion_result=1/2/3, conducted_via。チケットを消化する
--   4:コーチの欠席                       → status=3, cancel_category=2(coach), ticket_refunded=true
--   5:通信トラブル等で実施できなかった   → status=3, cancel_category=6(technical), ticket_refunded=true
--   4・5 はチケットを消化せず、返還された回は振替の対象になる（fn_schedule_shortfall）。
--
-- 【理由の保存先】
--   記録(recorded): 1〜3 は status_note、4・5 は cancel_reason に入れる。
--   修正(corrected): コーチが残した理由はそのまま残し（同じ種類の結果の間の修正では変えない）、
--   アドミンの理由は履歴（com_t_session_outcome_history.reason）に残す。種類が変わる場合（完了⇔キャンセル）で
--   移った先の欄が空のときだけアドミンの理由を入れる。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_apply_session_outcome(
    p_session_id uuid,
    p_outcome smallint,
    p_conducted_via smallint,
    p_reason text,
    p_action text,
    p_suggested_outcome smallint,
    p_outcome_mismatch boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_consumes boolean := p_outcome IN (1, 2, 3);
    v_ticket_action text := NULL;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_consumes THEN
        UPDATE public.com_t_session
        SET status = 2,
            completion_result = p_outcome,
            conducted_via = p_conducted_via,
            status_note = CASE
                WHEN p_action = 'recorded' THEN v_reason
                WHEN v_session.status = 2 THEN v_session.status_note
                ELSE COALESCE(v_session.status_note, v_reason)
            END,
            cancel_category = NULL,
            cancel_reason = NULL,
            cancelled_by = NULL,
            ticket_refunded = NULL,
            suggested_outcome = p_suggested_outcome,
            outcome_mismatch = p_outcome_mismatch,
            ticket_consumed = true,
            update_date = NOW()
        WHERE session_id = p_session_id;
    ELSE
        UPDATE public.com_t_session
        SET status = 3,
            completion_result = NULL,
            conducted_via = NULL,
            cancel_category = CASE WHEN p_outcome = 4 THEN 2 ELSE 6 END,
            cancel_reason = CASE
                WHEN p_action = 'recorded' THEN v_reason
                WHEN v_session.status = 3 THEN COALESCE(v_session.cancel_reason, v_reason)
                ELSE v_reason
            END,
            cancelled_by = CASE WHEN v_session.status = 3 THEN v_session.cancelled_by ELSE auth.uid() END,
            ticket_refunded = true,
            suggested_outcome = p_suggested_outcome,
            outcome_mismatch = false,
            ticket_consumed = false,
            update_date = NOW()
        WHERE session_id = p_session_id;
    END IF;

    IF v_consumes AND NOT v_session.ticket_consumed THEN
        PERFORM public.fn_consume_session_ticket(v_session.ticket_id, v_reason);
        v_ticket_action := 'consumed';
    ELSIF NOT v_consumes AND v_session.ticket_consumed THEN
        PERFORM public.fn_restore_session_ticket(v_session.ticket_id, v_reason);
        v_ticket_action := 'restored';
    END IF;

    INSERT INTO public.com_t_session_outcome_history
        (session_id, action, outcome, conducted_via, suggested_outcome,
         previous_status, previous_completion_result, previous_cancel_category, previous_conducted_via,
         ticket_action, reason, performed_by)
    VALUES
        (p_session_id, p_action, p_outcome, CASE WHEN v_consumes THEN p_conducted_via END, p_suggested_outcome,
         v_session.status, v_session.completion_result, v_session.cancel_category, v_session.conducted_via,
         v_ticket_action, v_reason, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_apply_session_outcome(uuid, smallint, smallint, text, text, smallint, boolean) FROM PUBLIC, anon, authenticated;
