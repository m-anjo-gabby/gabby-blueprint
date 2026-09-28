---------------------------------------------
-- 4. スプリントドリル履歴関数（新規追加）
---------------------------------------------
-- 【2026-09-22 抜本改修】対象生徒の判定を private.get_monitor_target_users に一本化
-- （get_monitor_sprint_history と同様。詳細はそちらのコメント参照）。
CREATE OR REPLACE FUNCTION public.get_monitor_sprint_drill_history(
    _start_date DATE,
    _end_date DATE,
    _user_ids UUID[] DEFAULT NULL,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    RETURN QUERY
    WITH target_users AS (
        SELECT t.user_id FROM private.get_monitor_target_users(_client_id, _start_date, _end_date, _include_monitor) t
        WHERE (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR t.user_id = ANY(_user_ids))
    )
    SELECT jsonb_build_object(
        'summary_id', d.summary_id,
        'user_id', d.user_id,
        'content_id', d.content_id,
        'training_date', d.training_date,
        'question_count', d.question_count,
        'assessment_count', d.assessment_count,
        'speed_count', d.speed_count,
        'structure_count', d.structure_count,
        'builders_count', d.builders_count,
        'mastery_count', d.mastery_count,
        'content_name', c.content_name,
        'user_name', u.user_name,
        'email', au.email
    )
    FROM public.self_t_sprint_summary d
    INNER JOIN target_users tu ON tu.user_id = d.user_id
    INNER JOIN public.com_m_user u ON u.id = d.user_id
    INNER JOIN auth.users au ON au.id = u.id
    LEFT JOIN public.com_m_contents c ON c.content_id = d.content_id
    WHERE d.training_date BETWEEN _start_date AND _end_date
    ORDER BY d.training_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_sprint_drill_history(DATE, DATE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_sprint_drill_history(DATE, DATE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_sprint_drill_history(DATE, DATE, UUID[], BOOLEAN) TO authenticated;
