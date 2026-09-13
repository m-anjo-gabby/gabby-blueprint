---------------------------------------------
-- 月次コーチングレポート承認RPC (2026-09-13 追加)
-- 前提: table/com_t_coach_monthly_report_approval.sql, function/get_coach_monthly_sessions.sql
--       の作成が完了していること。
---------------------------------------------
-- 【背景】
-- アドミンが対象コーチ・対象月の稼働を確認した上で承認する。コーチからの申請フローは無く、
-- アドミンの一方的な操作のみで確定する。承認時点のセッション集計（get_coach_monthly_sessionsの
-- counts_toward_totalを生徒別に集計したもの）をJSONBスナップショットとして固定保存し、
-- 事後のデータ変動（終了処理漏れの遅延解決等）から承認済み表示を保護する。
--
-- 【呼び出し元】
-- apps/adminはcreateAdminClient()(service_role)経由で呼ぶため、本関数内でauth.uid()は
-- 取得できない（NULLになる）。そのため承認者IDはp_approved_byとして明示的に受け取る
-- （adminContractAction.tsのperformed_by: resolvePerformedBy(ctx.userId)と同じ理由）。
--
-- 【終了処理未実施セッションの承認ブロック (2026-09-13 追加)】
-- 終了処理未実施(is_unresolved=true)のセッションが1件でも残っている月は、実績が確定して
-- いない（completed/no_show等に確定していない）とみなし、承認自体を拒否する。
-- 画面側（apps/admin ApprovalControlBar）でも同条件で承認ボタンを無効化しているが、
-- 画面表示後にコーチ側の操作で状態が変わる競合を防ぐため、本RPC側でも同じ判定を行う
-- （フロント側のチェックはUXのため、こちらが正の防御線）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_coach_monthly_report(
    p_coach_id uuid,
    p_report_month date,
    p_approved_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month date := date_trunc('month', p_report_month)::date;
    v_snapshot jsonb;
    v_unresolved_count integer;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to approve this monthly report';
    END IF;

    SELECT COUNT(*) INTO v_unresolved_count
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month) s
    WHERE s.is_unresolved;

    IF v_unresolved_count > 0 THEN
        RAISE EXCEPTION 'cannot approve while % unresolved session(s) remain for this month', v_unresolved_count;
    END IF;

    SELECT jsonb_build_object(
        'total', COALESCE(SUM((counts_toward_total)::int), 0),
        'by_student', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('student_id', student_id, 'count', cnt))
             FROM (
                 SELECT student_id, SUM((counts_toward_total)::int) AS cnt
                 FROM public.get_coach_monthly_sessions(p_coach_id, v_month)
                 GROUP BY student_id
             ) per_student),
            '[]'::jsonb
        )
    )
    INTO v_snapshot
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month);

    INSERT INTO public.com_t_coach_monthly_report_approval (
        coach_id, report_month, status, session_count_snapshot, approved_by, approved_at, update_date
    ) VALUES (
        p_coach_id, v_month, 2, v_snapshot, p_approved_by, NOW(), NOW()
    )
    ON CONFLICT (coach_id, report_month) DO UPDATE
    SET status = 2,
        session_count_snapshot = v_snapshot,
        approved_by = p_approved_by,
        approved_at = NOW(),
        update_date = NOW();

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        p_coach_id,
        'COACH_REPORT_APPROVED',
        jsonb_build_object('report_month', v_month),
        '/monthly-reports'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) TO authenticated;
