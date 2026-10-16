---------------------------------------------
-- ライブセッションの実施結果の修正RPC（アドミン） (2026-10-14 追加)
-- 前提: function/fn_session_outcome_evidence.sql, function/fn_apply_session_outcome.sql,
--       function/fn_assert_actor_or_admin.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチの記録（record_session_outcome）の誤り（生徒からの「参加していたのに未参加になっている」等の
-- 問い合わせ）や、コーチが記録しないまま残ったセッションを、アドミンが理由付きで確定・修正する。
-- 結果ごとの記録・チケットの消化/返還の差分・履歴は fn_apply_session_outcome に任せる。
--
-- 【対象】
--   開始予定時刻を過ぎたセッションのうち、次のいずれか
--   ・実施予定のまま残っている(status=1)
--   ・確定済み(status=2)
--   ・コーチの欠席・通信トラブル等で実施できなかった(status=3、cancel_category=2/6)
--   生徒のキャンセル・アドミンの代理キャンセル・契約終了等の自動キャンセルは対象外（予約の操作で扱う）。
--
-- 【入力】
--   p_outcome / p_conducted_via は record_session_outcome と同じ。理由は常に必須。
--   同じ結果のまま確定し直すこともできる（推定と違う印(outcome_mismatch)を「確認済み」として外す用途）。
--
-- 【注意】
--   ・アドミンの操作のため、生徒・コーチへの通知は送らない（アドミンのライブセッション管理の他の操作と同じ）。
--   ・返還済みのキャンセルを実施完了等へ直すとチケットを消化し直すが、返還された回で既に振替を予約していた
--     場合はその予約は残る（必要ならアドミンが予約をキャンセルする）。
--   ・承認済みの月次レポートの件数（com_t_coach_monthly_report_approval.session_count_snapshot）は変わらない。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_correct_session_outcome(
    p_session_id uuid,
    p_outcome smallint,
    p_conducted_via smallint,
    p_reason text
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
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to correct session outcomes');

    IF p_outcome IS NULL OR p_outcome NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'invalid outcome %', p_outcome;
    END IF;
    IF btrim(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'reason required to correct a session outcome';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.start_datetime > NOW() THEN
        RAISE EXCEPTION 'session has not started yet';
    END IF;

    IF NOT (
        v_session.status IN (1, 2)
        OR (v_session.status = 3 AND v_session.cancel_category IN (2, 6))
    ) THEN
        RAISE EXCEPTION 'session outcome cannot be corrected (status=%, cancel_category=%)', v_session.status, v_session.cancel_category;
    END IF;

    IF p_outcome IN (1, 2, 3) THEN
        IF p_conducted_via IS NULL OR p_conducted_via NOT IN (1, 2) THEN
            RAISE EXCEPTION 'invalid conducted_via %', p_conducted_via;
        END IF;
        v_via := p_conducted_via;
    END IF;

    SELECT * INTO v_evidence FROM public.fn_session_outcome_evidence(p_session_id);

    PERFORM public.fn_apply_session_outcome(
        p_session_id, p_outcome, v_via, p_reason, 'corrected', v_evidence.suggested_outcome, false
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_correct_session_outcome(uuid, smallint, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_correct_session_outcome(uuid, smallint, smallint, text) TO authenticated;
