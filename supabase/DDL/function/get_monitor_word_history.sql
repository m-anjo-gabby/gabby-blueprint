---------------------------------------------
-- 2. ドリル履歴関数（セキュリティ修正版）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monitor_word_history(
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
    SELECT jsonb_build_object(
        'summary_id', w.summary_id,
        'content_id', w.content_id,
        'user_id', w.user_id,
        'training_date', w.training_date,
        'word_count', w.word_count,
        'phrase_count', w.phrase_count,
        'assessment_count', w.assessment_count,
        'update_date', w.update_date,
        'content_name', c.content_name,
        'user_name', u.user_name
    )
    FROM public.self_t_word_summary w
    INNER JOIN public.com_m_user u ON u.id = w.user_id
    LEFT JOIN public.com_m_contents c ON c.content_id = w.content_id
    WHERE u.client_id = _client_id
      AND w.training_date BETWEEN _start_date AND _end_date
      AND (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR w.user_id = ANY(_user_ids))
      -- 💡 デモユーザーの履歴は常に100%遮断
      AND NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r WHERE r.user_id = u.id AND r.role_id = 'demo_user'
      )
      -- 💡 モニターの履歴切り替え
      AND (
        _include_monitor = TRUE
        OR
        NOT EXISTS (
          SELECT 1 FROM public.com_t_user_role r WHERE r.user_id = u.id AND r.role_id = 'monitor'
        )
      )
    ORDER BY w.training_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_word_history(DATE, DATE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_word_history(DATE, DATE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_word_history(DATE, DATE, UUID[], BOOLEAN) TO authenticated;
