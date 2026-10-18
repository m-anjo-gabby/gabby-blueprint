---------------------------------------------
-- ライブセッションの実施結果の記録RPC（コーチの「End Session」）
-- 前提: function/fn_session_outcome_evidence.sql, function/fn_apply_session_outcome.sql,
--       function/fn_notify.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 旧 finalize_session（入退室ログの重なりで自動判定。コーチが入室していないと使えない）と
-- resolve_stale_session（終了予定を過ぎ、かつコーチが入室していない場合だけの手動解決）の2経路を
-- 1つにまとめる。結果はコーチの申告を正とし、入退室ログからの推定（fn_session_outcome_evidence）は
-- 画面の初期値と、推定と違う結果にした場合の印（outcome_mismatch）に使う。
--
-- 【入力】
--   p_outcome      : 1:実施完了 2:生徒の都合で早く終了 3:生徒の欠席 4:コーチの欠席 5:通信トラブル等で実施できなかった
--   p_conducted_via: 1:アプリ内の通話 2:外部のZoom。p_outcome が 1〜3 の場合は必須、4・5 では無視する
--   p_reason       : 次のいずれかの場合は必須（画面の apps/coach の End Session ダイアログも同じ条件で必須にする）
--                    ・結果が 2・4・5
--                    ・外部のZoomで実施した
--                    ・アプリ内の通話で実施したと申告し、結果が推定と違う（コーチの入室記録が無い場合を含む）
--
-- 【条件】
--   担当コーチ本人のみ（アドミンは admin_correct_session_outcome を使う）。実施予定(status=1)で、
--   開始予定時刻を過ぎていること（開始前の欠席・中止は cancel_session で扱う）。
--
-- 【通知】
--   4（コーチの欠席）だけ、従来のコーチのキャンセルと同じ SESSION_CANCELLED_BY_COACH を生徒へ送る。
--   1〜3・5 は送らない（生徒の欠席を知らせる通知は、生徒にとって否定的に受け取られやすいため送らない。
--   生徒の画面の一覧で「未参加」と表示する）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.record_session_outcome(
    p_session_id uuid,
    p_outcome smallint,
    p_conducted_via smallint DEFAULT NULL,
    p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_evidence RECORD;
    v_via smallint;
    v_mismatch boolean;
    v_has_reason boolean := btrim(COALESCE(p_reason, '')) <> '';
    v_coach_name text;
BEGIN
    IF p_outcome IS NULL OR p_outcome NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'invalid outcome %', p_outcome;
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'not authorized to record this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime > NOW() THEN
        RAISE EXCEPTION 'session has not started yet';
    END IF;

    IF p_outcome IN (1, 2, 3) THEN
        IF p_conducted_via IS NULL OR p_conducted_via NOT IN (1, 2) THEN
            RAISE EXCEPTION 'invalid conducted_via %', p_conducted_via;
        END IF;
        v_via := p_conducted_via;
    END IF;

    SELECT * INTO v_evidence FROM public.fn_session_outcome_evidence(p_session_id);
    v_mismatch := v_via = 1 AND v_evidence.suggested_outcome IS DISTINCT FROM p_outcome;

    IF NOT v_has_reason AND (p_outcome IN (2, 4, 5) OR v_via = 2 OR v_mismatch) THEN
        RAISE EXCEPTION 'reason required for this outcome';
    END IF;

    PERFORM public.fn_apply_session_outcome(
        p_session_id, p_outcome, v_via, p_reason, 'recorded', v_evidence.suggested_outcome, COALESCE(v_mismatch, false)
    );

    IF p_outcome = 4 THEN
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
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_session_outcome(uuid, smallint, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_session_outcome(uuid, smallint, smallint, text) TO authenticated;
