---------------------------------------------
-- 期限超過scheduledセッションの手動解決RPC (2026-09-04 追加)
-- 前提: function/finalize_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 通常は「レッスン終了」ボタン(finalize_session)で自動判定されるが、
-- コーチのクラッシュ・アプリ外Zoom等での代替実施等により、予定終了時刻を
-- 過ぎてもscheduledのまま残るケースの唯一のセーフティネット。
-- com_t_session_call_logが空（アプリ外で実施した場合等）でも成立するよう、
-- finalize_session側の自動判定ロジックは再利用せず、コーチの申告
-- （p_resolved_status）をそのまま理由付きで記録する。
-- バッチ処理(pg_cron等)は導入せず、本RPCへのコーチの明示操作のみを解決経路とする。
--
-- 【ステータス簡素化 (2026-09-14変更)】
-- statusは常に2(completed)を確定し、コーチが申告する内訳はp_completion_result
-- (1:normal/2:early_ended/3:no_show)として受け取る（旧: p_resolved_statusに
-- 2/6/7のstatus値を直接渡す方式だった。table/com_t_session.sqlのステータス
-- 簡素化パッチ参照）。パラメータの意味が変わるため、CREATE OR REPLACEの前に
-- DROP FUNCTIONで旧シグネチャを明示的に削除する。
---------------------------------------------
DROP FUNCTION IF EXISTS public.resolve_stale_session(uuid, smallint, text);

CREATE OR REPLACE FUNCTION public.resolve_stale_session(p_session_id uuid, p_completion_result smallint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_ticket RECORD;
BEGIN
    IF p_completion_result NOT IN (1, 2, 3) THEN
        RAISE EXCEPTION 'invalid completion result %', p_completion_result;
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason required to resolve a stale session';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to resolve this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.end_datetime > NOW() THEN
        RAISE EXCEPTION 'cannot resolve a session before its end time';
    END IF;

    UPDATE public.com_t_session
    SET status = 2, completion_result = p_completion_result, status_note = p_reason, update_date = NOW()
    WHERE session_id = p_session_id;

    IF p_completion_result = 1 THEN
        UPDATE public.com_t_user_session_ticket
        SET used_sessions = used_sessions + 1, update_date = NOW()
        WHERE ticket_id = v_session.ticket_id
        RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

        IF FOUND THEN
            INSERT INTO public.com_t_user_session_ticket_history
                (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
            VALUES
                (v_session.ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, p_reason, auth.uid());
        END IF;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) TO authenticated;
