---------------------------------------------
-- チケット消費(used_sessions加算 + 履歴記録) 共通ヘルパー関数 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- finalize_session()（レッスン終了ボタンでの自動判定）とresolve_stale_session()
-- （終了処理未実施セッションの手動解決）は、いずれも「正常完了(completion_result=1)の
-- 場合のみ、com_t_user_session_ticket.used_sessionsを+1し、
-- com_t_user_session_ticket_historyにaction='consumed'の履歴行を追記する」という
-- 同一のペア処理を持っていた（noteに入れる値がNULL/理由テキストで違うだけ）。
-- チケット消化という実際の対価が発生する唯一の箇所であるため、本関数に集約し、
-- 「消費のたびに必ず履歴が対になって残る」ことを1箇所で保証する。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_consume_session_ticket(
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
    SET used_sessions = used_sessions + 1, update_date = NOW()
    WHERE ticket_id = p_ticket_id
    RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

    IF FOUND THEN
        INSERT INTO public.com_t_user_session_ticket_history
            (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
        VALUES
            (p_ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, p_note, auth.uid());
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_consume_session_ticket(uuid, text) FROM PUBLIC, anon, authenticated;
