---------------------------------------------
-- 「レッスン終了」ボタン用 実施結果自動判定RPC (2026-09-04 追加)
-- 前提: table/com_t_session_call_log.sql, table/com_t_user_session_ticket_history.sql
--       の作成が完了していること。
---------------------------------------------
-- 【背景】
-- ビデオ通話ルーム内の「退室」ボタンとは別に、コーチの外側画面（ダッシュボード/
-- 生徒詳細）に配置する「レッスン終了」ボタンから呼び出す。com_t_session_call_log
-- に記録されたコーチ・生徒それぞれの在室区間の重複時間を集計し、以下のルールで
-- com_t_session.statusを自動確定する。
--   ・重複20分以上                          → completed(2)
--   ・20分未満だが生徒の入室記録がある         → early_ended(7)。理由必須
--   ・生徒の入室記録が一度も無い               → no_show(6)
-- 早期終了時に理由(p_early_end_reason)が未指定の場合は固定文言でRAISE EXCEPTIONし、
-- 呼び出し側（TypeScript層）がこれを検知して理由入力ダイアログを表示し、
-- 理由付きで再実行する運用とする。
--
-- 【チケット消化】
-- completed確定時、com_t_user_session_ticket.used_sessionsを+1し、
-- com_t_user_session_ticket_history に action='consumed' の行を追記する。
-- これはcom_t_user_session_ticket.sql / com_t_user_session_ticket_history.sql の
-- コメントで「将来実装する予約管理機能がセッション実施完了時に加算する」と
-- 想定されていた処理そのものであり、本関数がその実装にあたる。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_session(p_session_id uuid, p_early_end_reason text DEFAULT NULL)
RETURNS TABLE(new_status smallint, overlap_seconds integer, student_joined boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_overlap_seconds numeric;
    v_student_joined boolean;
    v_new_status smallint;
    v_ticket RECORD;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id <> auth.uid() THEN
        RAISE EXCEPTION 'not authorized to finalize this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    -- コーチ側・生徒側それぞれの在室区間の交差（重複）時間の合計を計算する。
    -- left_atが未クローズ(NULL)の行はNOW()を暫定終了時刻として扱う。
    SELECT COALESCE(SUM(GREATEST(0,
             EXTRACT(EPOCH FROM (LEAST(c.left_end, s.left_end) - GREATEST(c.joined_at, s.joined_at)))
           )), 0)
      INTO v_overlap_seconds
      FROM (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
              FROM public.com_t_session_call_log
              WHERE session_id = p_session_id AND role = 'coach') c
      CROSS JOIN (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
                    FROM public.com_t_session_call_log
                    WHERE session_id = p_session_id AND role = 'student') s;

    SELECT EXISTS(
      SELECT 1 FROM public.com_t_session_call_log WHERE session_id = p_session_id AND role = 'student'
    ) INTO v_student_joined;

    IF v_overlap_seconds >= 1200 THEN -- 20分
        v_new_status := 2; -- completed
    ELSIF v_student_joined THEN
        IF p_early_end_reason IS NULL OR btrim(p_early_end_reason) = '' THEN
            RAISE EXCEPTION 'reason required for early-ended session';
        END IF;
        v_new_status := 7; -- early_ended
    ELSE
        v_new_status := 6; -- no_show
    END IF;

    UPDATE public.com_t_session
    SET status = v_new_status,
        status_note = CASE WHEN v_new_status = 7 THEN p_early_end_reason ELSE NULL END,
        update_date = NOW()
    WHERE session_id = p_session_id;

    IF v_new_status = 2 THEN
        UPDATE public.com_t_user_session_ticket
        SET used_sessions = used_sessions + 1, update_date = NOW()
        WHERE ticket_id = v_session.ticket_id
        RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

        IF FOUND THEN
            INSERT INTO public.com_t_user_session_ticket_history
                (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
            VALUES
                (v_session.ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, NULL, auth.uid());
        END IF;
    END IF;

    RETURN QUERY SELECT v_new_status, v_overlap_seconds::integer, v_student_joined;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_session(uuid, text) TO authenticated;
