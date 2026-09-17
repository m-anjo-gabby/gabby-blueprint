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
--
-- 【権限チェックの共通化 (2026-09-15追加)】
-- fn_assert_actor_or_admin()を使う（前提: function/fn_assert_actor_or_admin.sql）。
--
-- 【チケット消費処理の共通化 (2026-09-15追加)】
-- 「used_sessions加算＋com_t_user_session_ticket_historyへの履歴記録」のペアは、
-- finalize_session()と同一処理だったため、fn_consume_session_ticket()に切り出した
-- （前提: function/fn_consume_session_ticket.sql）。
--
-- 【コーチ自身の無断欠席への対応 (2026-09-17追加)】
-- 従来はcompletion_result(1/2/3)のいずれかで「完了」として記録する方法しか無く、コーチ自身が
-- 実施を失念した場合もno_show(3)として記録するしかなかった。しかしno_showは本来「相手（生徒）が
-- 来なかった」ことを表す値であり、コーチの無断欠席をこれで記録すると事実と異なる印象を生徒側の
-- 履歴に残す上、コーチキャンセル(cancel_session)が持つ「チケット常時返還」「生徒への通知」が
-- 一切行われない。そのためp_resolutionに4(coach_no_show)を渡した場合のみ例外的に、
-- completion_resultを使わずcancel_session()のコーチキャンセル分岐と同じ結果(status=3 cancelled,
-- cancel_category=2 coach, ticket_refunded=true)を記録し、生徒へfn_notify()で通知する。
-- cancel_session()自体は「開始前セッションの事前キャンセル」専用にstart_datetime<=NOW()を
-- 禁止しているため、本関数（期限超過セッション専用）には統合せず、ここでのみ分岐を追加する。
-- 振替候補の提案(proposed_slots)はcancel_session()と異なり本関数では提供しない（事後報告のための
-- シンプルな経路に留め、振替が必要な場合はコーチが別途生徒と調整する想定）。
-- 引数名をp_completion_result→p_resolutionに変更した（1-3はCOMPLETION_RESULTと値を共有し、
-- 4のみ例外でcompletion_resultカラムには入らない）。PostgreSQLはCREATE OR REPLACEのみでの
-- 引数名変更を許可しない（42P13エラー）ため、型・個数が同じでもDROP FUNCTIONが必要。
---------------------------------------------
DROP FUNCTION IF EXISTS public.resolve_stale_session(uuid, smallint, text);

CREATE OR REPLACE FUNCTION public.resolve_stale_session(p_session_id uuid, p_resolution smallint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_coach_name text;
BEGIN
    IF p_resolution NOT IN (1, 2, 3, 4) THEN
        RAISE EXCEPTION 'invalid resolution %', p_resolution;
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason required to resolve a stale session';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_session.coach_id, 'not authorized to resolve this session');

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.end_datetime > NOW() THEN
        RAISE EXCEPTION 'cannot resolve a session before its end time';
    END IF;

    IF p_resolution = 4 THEN
        UPDATE public.com_t_session
        SET status = 3, cancel_category = 2, cancel_reason = p_reason, cancelled_by = auth.uid(),
            ticket_refunded = true, update_date = NOW()
        WHERE session_id = p_session_id;

        SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_session.coach_id;
        PERFORM public.fn_notify(
            v_session.student_id,
            'SESSION_CANCELLED_BY_COACH',
            jsonb_build_object(
                'session_id', p_session_id,
                'coach_name', v_coach_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', 0
            ),
            '/live-room'
        );
        RETURN;
    END IF;

    UPDATE public.com_t_session
    SET status = 2, completion_result = p_resolution, status_note = p_reason, update_date = NOW()
    WHERE session_id = p_session_id;

    IF p_resolution = 1 THEN
        PERFORM public.fn_consume_session_ticket(v_session.ticket_id, p_reason);
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) TO authenticated;
