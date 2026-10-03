---------------------------------------------
-- トレーニングレポート(PDF)の掲載データ取得 (2026-10-01 追加)
-- 前提: function/get_sprint_level_as_of.sql, table/self_t_word_summary.sql, table/self_t_sprint_summary.sql,
--       table/com_t_session.sql（ステータス簡素化パッチまで）, table/com_t_contract_training_report.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 生徒向けトレーニングレポートに載せる内容を、ライセンス（＝生徒の契約期間）ごとに1回で集計する。
-- 契約単位の一括作成でも1回の呼び出しで済むよう、ライセンスIDの配列を受け取り、JSONの配列で返す。
-- レポートは作成のたびに最新のデータから作る（ドラフト段階のため、作成時点の内容は保存しない）。
--
-- 【集計内容】
--   levels_start / levels_end: 期間の開始時点・終了時点のスプリント到達レベル（問題種別ごと。
--     記録開始前の時点はNULL）。終了前に作成した場合の終了時点は作成時点とする。
--   activity / monthly: 期間中の学習量（学習日数・単語・フレーズ・スプリント問題数・発話評価の回数）。
--     単語帳・スプリントのドリルは日次サマリーの training_date（記録時点の生徒のタイムゾーンでの日付）、
--     スプリントのセッション（self_t_sprint）は実施日時を生徒のタイムゾーンでの日付にして数え、
--     ライセンス期間の日本時間（集計期間のタイムゾーン public.reporting_timezone()）の日付範囲で絞る
--     （顧客との契約が日本法人のため、期間は日本時間で扱う）。
--     スプリント問題数はドリルの問題数とセッションの回答数の合計。
--   live: ライブセッション付き契約の受講状況（Blueprintのみの契約はNULL）。
--     completed: 実施（正常終了・早期終了）/ no_show: 生徒の欠席 / late_cancel: 生徒の直前キャンセル（返還なし）
--   comments: コーチからのコメント（下書き・確定の両方。PDF側で下書きを区別して表示する）
--
-- 【呼び出し元】
-- apps/admin から createAdminClient()（service_role）経由でのみ呼ぶ。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_training_report_data(uuid[]);

CREATE OR REPLACE FUNCTION public.get_training_report_data(p_license_ids uuid[])
RETURNS jsonb AS $$
    WITH lic AS (
        SELECT
            l.license_id, l.user_id, l.status, l.start_date, l.end_date,
            (l.start_date AT TIME ZONE public.reporting_timezone())::date AS from_date,
            (l.end_date AT TIME ZONE public.reporting_timezone())::date AS to_date,
            LEAST(l.end_date, NOW()) AS level_end_at,
            u.user_name,
            COALESCE(u.timezone, 'Asia/Tokyo') AS timezone,
            c.contract_id, c.contract_name, c.plan_name, cl.client_name,
            t.ticket_id, t.total_sessions
        FROM public.com_t_user_license l
        JOIN public.com_m_user u ON u.id = l.user_id
        JOIN public.com_m_contract c ON c.contract_id = l.contract_id
        JOIN public.com_m_client cl ON cl.client_id = c.client_id
        LEFT JOIN public.com_t_user_session_ticket t ON t.license_id = l.license_id
        WHERE l.license_id = ANY(p_license_ids)
    ),
    daily AS (
        SELECT
            lic.license_id,
            d.training_date,
            SUM(d.words)::integer AS words,
            SUM(d.phrases)::integer AS phrases,
            SUM(d.sprint_questions)::integer AS sprint_questions,
            SUM(d.assessments)::integer AS assessments
        FROM lic
        CROSS JOIN LATERAL (
            SELECT w.training_date, w.word_count AS words, w.phrase_count AS phrases,
                   0 AS sprint_questions, w.assessment_count AS assessments
            FROM public.self_t_word_summary w
            WHERE w.user_id = lic.user_id AND w.training_date BETWEEN lic.from_date AND lic.to_date
            UNION ALL
            SELECT s.training_date, 0, 0, s.question_count, s.assessment_count
            FROM public.self_t_sprint_summary s
            WHERE s.user_id = lic.user_id AND s.training_date BETWEEN lic.from_date AND lic.to_date
            UNION ALL
            SELECT (ss.insert_date AT TIME ZONE lic.timezone)::date, 0, 0, ss.total_answered, ss.total_assessments
            FROM public.self_t_sprint ss
            WHERE ss.user_id = lic.user_id
              AND (ss.insert_date AT TIME ZONE lic.timezone)::date BETWEEN lic.from_date AND lic.to_date
        ) d
        GROUP BY lic.license_id, d.training_date
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'license_id', lic.license_id,
            'license_status', lic.status,
            'start_date', lic.start_date,
            'end_date', lic.end_date,
            'student_id', lic.user_id,
            'student_name', lic.user_name,
            'contract_id', lic.contract_id,
            'contract_name', lic.contract_name,
            'plan_name', lic.plan_name,
            'client_name', lic.client_name,
            'levels_start', jsonb_build_object(
                '0', public.get_sprint_level_as_of(lic.user_id, 0::smallint, lic.start_date),
                '4', public.get_sprint_level_as_of(lic.user_id, 4::smallint, lic.start_date),
                '5', public.get_sprint_level_as_of(lic.user_id, 5::smallint, lic.start_date),
                '6', public.get_sprint_level_as_of(lic.user_id, 6::smallint, lic.start_date)
            ),
            'levels_end', jsonb_build_object(
                '0', public.get_sprint_level_as_of(lic.user_id, 0::smallint, lic.level_end_at),
                '4', public.get_sprint_level_as_of(lic.user_id, 4::smallint, lic.level_end_at),
                '5', public.get_sprint_level_as_of(lic.user_id, 5::smallint, lic.level_end_at),
                '6', public.get_sprint_level_as_of(lic.user_id, 6::smallint, lic.level_end_at)
            ),
            'activity', (
                SELECT jsonb_build_object(
                    'active_days', COUNT(*)::integer,
                    'words', COALESCE(SUM(daily.words), 0)::integer,
                    'phrases', COALESCE(SUM(daily.phrases), 0)::integer,
                    'sprint_questions', COALESCE(SUM(daily.sprint_questions), 0)::integer,
                    'assessments', COALESCE(SUM(daily.assessments), 0)::integer
                )
                FROM daily WHERE daily.license_id = lic.license_id
            ),
            'monthly', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'month', m.month,
                    'active_days', m.active_days,
                    'words', m.words,
                    'phrases', m.phrases,
                    'sprint_questions', m.sprint_questions
                ) ORDER BY m.month), '[]'::jsonb)
                FROM (
                    SELECT to_char(daily.training_date, 'YYYY-MM') AS month,
                           COUNT(*)::integer AS active_days,
                           SUM(daily.words)::integer AS words,
                           SUM(daily.phrases)::integer AS phrases,
                           SUM(daily.sprint_questions)::integer AS sprint_questions
                    FROM daily WHERE daily.license_id = lic.license_id
                    GROUP BY 1
                ) m
            ),
            'live', CASE WHEN lic.ticket_id IS NULL THEN NULL ELSE (
                SELECT jsonb_build_object(
                    'total_sessions', lic.total_sessions,
                    'completed', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result IN (1, 2))::integer,
                    'no_show', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result = 3)::integer,
                    'late_cancel', COUNT(*) FILTER (WHERE s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded IS FALSE)::integer
                )
                FROM public.com_t_session s
                WHERE s.ticket_id = lic.ticket_id
            ) END,
            'comments', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'coach_name', cu.user_name,
                    'status', r.status,
                    'comment_text', r.comment_text,
                    'finalized_at', r.finalized_at
                ) ORDER BY r.insert_date), '[]'::jsonb)
                FROM public.com_t_contract_training_report r
                JOIN public.com_m_user cu ON cu.id = r.coach_id
                WHERE r.ticket_id = lic.ticket_id
            )
        )
        ORDER BY lic.user_name
    ), '[]'::jsonb)
    FROM lic;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_training_report_data(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_report_data(uuid[]) TO service_role;
