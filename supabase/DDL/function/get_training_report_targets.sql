---------------------------------------------
-- トレーニングレポート作成対象のライセンス一覧取得 (2026-10-01 追加)
-- 前提: table/com_t_user_license.sql, table/com_m_contract.sql（contract_name追加パッチまで）,
--       table/com_t_user_session_ticket.sql, table/com_t_contract_training_report.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 生徒向けトレーニングレポートは、ライセンス（＝生徒の契約期間）ごとに、期間の満了時に作成する。
-- アドミンの「サポート > トレーニングレポート」画面で、満了日（end_date）が指定範囲にある
-- ライセンスを、契約・生徒・コーチのコメントの記入状況とあわせて一覧表示するために使う。
-- ライセンスの状態（有効・停止・満了）は問わない（途中で停止した生徒にも作成できるようにする）。
--
-- 【呼び出し元】
-- apps/admin から createAdminClient()（service_role）経由でのみ呼ぶ。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_training_report_targets(timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_training_report_targets(
    p_from timestamp with time zone,
    p_to timestamp with time zone
)
RETURNS TABLE (
    license_id uuid,
    license_status smallint,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    student_id uuid,
    student_name text,
    contract_id uuid,
    contract_name text,
    plan_name text,
    client_name text,
    has_live_session boolean,
    finalized_comment_count integer,
    draft_comment_count integer
) AS $$
    SELECT
        l.license_id,
        l.status,
        l.start_date,
        l.end_date,
        l.user_id,
        u.user_name,
        c.contract_id,
        c.contract_name,
        c.plan_name,
        cl.client_name,
        t.ticket_id IS NOT NULL,
        COALESCE(rc.finalized_count, 0),
        COALESCE(rc.draft_count, 0)
    FROM public.com_t_user_license l
    JOIN public.com_m_user u ON u.id = l.user_id
    JOIN public.com_m_contract c ON c.contract_id = l.contract_id
    JOIN public.com_m_client cl ON cl.client_id = c.client_id
    LEFT JOIN public.com_t_user_session_ticket t ON t.license_id = l.license_id
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) FILTER (WHERE r.status = 2)::integer AS finalized_count,
            COUNT(*) FILTER (WHERE r.status = 1)::integer AS draft_count
        FROM public.com_t_contract_training_report r
        WHERE r.ticket_id = t.ticket_id
    ) rc ON true
    WHERE l.end_date >= p_from AND l.end_date < p_to
    ORDER BY cl.client_name, c.contract_name, u.user_name;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_training_report_targets(timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_report_targets(timestamp with time zone, timestamp with time zone) TO service_role;
