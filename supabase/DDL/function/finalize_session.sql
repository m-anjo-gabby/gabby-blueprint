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
--
-- 【ステータス簡素化 (2026-09-14変更)】
-- statusは常に2(completed)を確定し、正常終了/早期終了/no_showの内訳はcompletion_result
-- (1/2/3)に分離する（table/com_t_session.sqlのステータス簡素化パッチ参照）。
-- used_sessionsの加算は、従来どおり正常終了(completion_result=1)の場合のみ行う
-- （早期終了・no_showはコーチが対応した実績としてはカウントするが、チケットは
-- 消化させない、という既存仕様を維持）。RETURNS TABLEにcompletion_resultを追加する
-- 戻り値の型変更のため、CREATE OR REPLACEの前にDROP FUNCTIONで旧シグネチャを削除する。
--
-- 【チケット消費処理の共通化 (2026-09-15追加)】
-- 「used_sessions加算＋com_t_user_session_ticket_historyへの履歴記録」のペアは、
-- resolve_stale_session()と同一処理だったため、fn_consume_session_ticket()に切り出した
-- （前提: function/fn_consume_session_ticket.sql）。
---------------------------------------------
DROP FUNCTION IF EXISTS public.finalize_session(uuid, text);

CREATE OR REPLACE FUNCTION public.finalize_session(p_session_id uuid, p_early_end_reason text DEFAULT NULL)
RETURNS TABLE(new_status smallint, completion_result smallint, overlap_seconds integer, student_joined boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_overlap_seconds numeric;
    v_student_joined boolean;
    v_completion_result smallint;
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
        v_completion_result := 1; -- normal
    ELSIF v_student_joined THEN
        IF p_early_end_reason IS NULL OR btrim(p_early_end_reason) = '' THEN
            RAISE EXCEPTION 'reason required for early-ended session';
        END IF;
        v_completion_result := 2; -- early_ended
    ELSE
        v_completion_result := 3; -- no_show
    END IF;

    UPDATE public.com_t_session
    SET status = 2, completion_result = v_completion_result,
        status_note = CASE WHEN v_completion_result = 2 THEN p_early_end_reason ELSE NULL END,
        update_date = NOW()
    WHERE session_id = p_session_id;

    IF v_completion_result = 1 THEN
        PERFORM public.fn_consume_session_ticket(v_session.ticket_id);
    END IF;

    RETURN QUERY SELECT 2::smallint, v_completion_result, v_overlap_seconds::integer, v_student_joined;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_session(uuid, text) TO authenticated;
