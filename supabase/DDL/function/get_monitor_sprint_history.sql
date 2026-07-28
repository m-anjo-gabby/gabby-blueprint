---------------------------------------------
-- 3. スプリント履歴関数（セキュリティ修正版）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monitor_sprint_history(
    _start_date TIMESTAMP WITH TIME ZONE,
    _end_date TIMESTAMP WITH TIME ZONE,
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
        SELECT tu.id, tu.user_name, tu.email
        FROM public.get_monitor_user_list(_include_monitor) tu
        WHERE (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR tu.id = ANY(_user_ids))
    )
    SELECT jsonb_build_object(
        'self_sprint_id', s.self_sprint_id,
        'user_id', s.user_id,
        'sprint_type', s.sprint_type,
        'content_id', s.content_id,
        'question_type', s.question_type,
        'answer_type', s.answer_type,
        'difficulty_level', s.difficulty_level,
        'time_limit_sec', s.time_limit_sec,
        'total_answered', s.total_answered,
        'total_assessments', s.total_assessments,
        'insert_date', s.insert_date,
        'content_name', c.content_name,
        'user_name', u.user_name,
        'email', u.email
    )
    FROM public.self_t_sprint s
    INNER JOIN target_users u ON u.id = s.user_id
    LEFT JOIN public.com_m_contents c ON c.content_id = s.content_id
    WHERE s.insert_date BETWEEN _start_date AND _end_date
    ORDER BY s.insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) TO authenticated;
