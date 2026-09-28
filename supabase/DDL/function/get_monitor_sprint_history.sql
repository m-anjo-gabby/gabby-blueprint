---------------------------------------------
-- 3. スプリント履歴関数（セキュリティ修正版）
---------------------------------------------
-- 【2026-09-22 抜本改修】対象生徒の判定を private.get_monitor_target_users に一本化。
-- 従来は get_monitor_user_list（表示用の付随情報まで結合する重い一覧関数）を対象生徒の
-- 絞り込みだけの目的で呼び出していた。対象生徒の判定ロジック自体は private.get_monitor_target_users
-- に集約されたため、本関数はそちらを直接呼び出す（余計なJOINを避け、判定ロジックの変更も
-- 一箇所で完結する）。
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
        SELECT t.user_id FROM private.get_monitor_target_users(_client_id, _start_date::date, _end_date::date, _include_monitor) t
        WHERE (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR t.user_id = ANY(_user_ids))
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
        'email', au.email
    )
    FROM public.self_t_sprint s
    INNER JOIN target_users tu ON tu.user_id = s.user_id
    INNER JOIN public.com_m_user u ON u.id = s.user_id
    INNER JOIN auth.users au ON au.id = u.id
    LEFT JOIN public.com_m_contents c ON c.content_id = s.content_id
    WHERE s.insert_date BETWEEN _start_date AND _end_date
    ORDER BY s.insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN) TO authenticated;
