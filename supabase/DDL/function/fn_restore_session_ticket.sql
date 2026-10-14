---------------------------------------------
-- チケット返還(used_sessions減算 + 履歴記録) 共通ヘルパー関数 (2026-10-14 追加)
-- 前提: table/com_t_user_session_ticket.sql, table/com_t_user_session_ticket_history.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- fn_consume_session_ticket() の逆の操作。アドミンが実施結果を「チケットを消化する結果」から
-- 「消化しない結果」（コーチの欠席・通信トラブル等）へ修正した場合に、消化済みの1回を戻す
-- （admin_correct_session_outcome → fn_apply_session_outcome から呼ぶ）。
-- 減算と com_t_user_session_ticket_history への action='restored' の履歴行を必ず対で残す。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_restore_session_ticket(
    p_ticket_id uuid,
    p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket RECORD;
BEGIN
    UPDATE public.com_t_user_session_ticket
    SET used_sessions = GREATEST(used_sessions - 1, 0), update_date = NOW()
    WHERE ticket_id = p_ticket_id
    RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

    IF FOUND THEN
        INSERT INTO public.com_t_user_session_ticket_history
            (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
        VALUES
            (p_ticket_id, v_ticket.contract_id, v_ticket.user_id, 'restored', 1, v_ticket.used_sessions, v_ticket.total_sessions, p_note, auth.uid());
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_restore_session_ticket(uuid, text) FROM PUBLIC, anon, authenticated;
