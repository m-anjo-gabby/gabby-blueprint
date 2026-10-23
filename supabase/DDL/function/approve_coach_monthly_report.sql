---------------------------------------------
-- 月次コーチングレポート承認RPC
-- 前提: table/com_t_coach_monthly_report_approval.sql, function/get_coach_monthly_sessions.sql,
--       table/com_m_session_pay_rate.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- アドミンが対象コーチ・対象月の稼働を確認した上で承認する。コーチからの申請フローは無く、
-- アドミンの一方的な操作のみで確定する。承認時点のセッション集計をJSONBスナップショットとして固定保存し、
-- 事後のデータ変動（実施結果の修正・終了処理漏れの遅延解決等）から承認済みの件数と支払額を保護する。
-- 請求書・支払通知書（PDF）の件数・内訳・金額はこのスナップショットから作る。承認後の変更を支払いに
-- 反映するには、承認を取り消してから承認し直す。
--
-- 【スナップショットの形】
-- {"total": 合計, "completed": 完了（早期終了を含む）, "late_cancel": 生徒の12時間未満のキャンセル,
--  "no_show": 生徒の欠席, "by_student": [{"student_id", "count"}]}
-- 数えるのは get_coach_monthly_sessions の counts_toward_total の行すべて（生徒のライセンス・契約の状態は問わない）。
-- 内訳の区分は packages/lib/monthlyReport/actions/monthlyReportActions.ts の画面の内訳と同じ。
--
-- 【呼び出し元】
-- apps/adminはcreateAdminClient()(service_role)経由で呼ぶため、本関数内でauth.uid()は
-- 取得できない（NULLになる）。そのため承認者IDはp_approved_byとして明示的に受け取る
-- （adminContractAction.tsのperformed_by: resolvePerformedBy(ctx.userId)と同じ理由）。
--
-- 【承認できない月】
-- ・終了処理未実施(is_unresolved=true)のセッションが1件でも残っている月（実績が確定していない）。
-- ・コーチのタイムゾーンで今月より後の月（まだ稼働が無い）。セッションが0件の過去の月・今月は承認できる。
-- ・承認済みの月（スナップショット・単価・承認日時を上書きし、通知を二重に送らないため）。
-- 画面側（apps/admin ApprovalControlBar）でも同条件でボタンを出し分けているが、画面表示後の状態の変化や
-- 二重の送信に備え、本RPC側でも同じ判定を行う（こちらが正の防御線）。
--
-- 【支払通知書PDF向け単価スナップショット】
-- コーチ向け月次支払通知書(PDF)の支払額(単価×総セッション数)を、承認後の単価マスタ改定
-- から保護するため、承認時点のcom_m_session_pay_rateの値をrate_amount/rate_currencyへ
-- 固定保存する。単価マスタは管理者のみ参照可能（RLS）だが、本関数はSECURITY DEFINERの
-- ためRLSを経由せず直接参照できる。
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
    v_coach_timezone text;
    v_snapshot jsonb;
    v_unresolved_count integer;
    v_rate_amount numeric(10, 2);
    v_rate_currency text;
BEGIN
    IF public.get_jwt_user_type() IS NOT NULL AND NOT public.is_system_admin() THEN
        RAISE EXCEPTION 'not authorized to approve this monthly report';
    END IF;

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_month > date_trunc('month', NOW() AT TIME ZONE COALESCE(v_coach_timezone, 'Asia/Tokyo'))::date THEN
        RAISE EXCEPTION 'cannot approve a future month';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_monthly_report_approval a
        WHERE a.coach_id = p_coach_id AND a.report_month = v_month AND a.status = 2
    ) THEN
        RAISE EXCEPTION 'monthly report is already approved';
    END IF;

    SELECT COUNT(*) INTO v_unresolved_count
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month) s
    WHERE s.is_unresolved;

    IF v_unresolved_count > 0 THEN
        RAISE EXCEPTION 'cannot approve while % unresolved session(s) remain for this month', v_unresolved_count;
    END IF;

    SELECT jsonb_build_object(
        'total', COUNT(*),
        'completed', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result IS DISTINCT FROM 3),
        'late_cancel', COUNT(*) FILTER (WHERE s.status = 3),
        'no_show', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result = 3),
        'by_student', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('student_id', per_student.student_id, 'count', per_student.cnt))
             FROM (
                 SELECT ps.student_id, COUNT(*) AS cnt
                 FROM public.get_coach_monthly_sessions(p_coach_id, v_month) ps
                 WHERE ps.counts_toward_total
                 GROUP BY ps.student_id
             ) per_student),
            '[]'::jsonb
        )
    )
    INTO v_snapshot
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month) s
    WHERE s.counts_toward_total;

    SELECT rate_amount, currency_code INTO v_rate_amount, v_rate_currency
    FROM public.com_m_session_pay_rate
    ORDER BY update_date DESC
    LIMIT 1;

    INSERT INTO public.com_t_coach_monthly_report_approval (
        coach_id, report_month, status, session_count_snapshot, rate_amount, rate_currency, approved_by, approved_at, update_date
    ) VALUES (
        p_coach_id, v_month, 2, v_snapshot, v_rate_amount, v_rate_currency, p_approved_by, NOW(), NOW()
    )
    ON CONFLICT (coach_id, report_month) DO UPDATE
    SET status = 2,
        session_count_snapshot = v_snapshot,
        rate_amount = v_rate_amount,
        rate_currency = v_rate_currency,
        approved_by = p_approved_by,
        approved_at = NOW(),
        update_date = NOW();

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        p_coach_id,
        'COACH_REPORT_APPROVED',
        jsonb_build_object('report_month', v_month),
        -- 対象の月を開く（月の指定が無いと今月が開くため）
        '/monthly-reports?month=' || to_char(v_month, 'YYYY-MM')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) TO authenticated;
