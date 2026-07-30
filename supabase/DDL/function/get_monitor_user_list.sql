---------------------------------------------
-- 1. ユーザーリスト関数（セキュリティ修正版）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monitor_user_list(
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF private.vw_user_list
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
    SELECT v.*
    FROM private.vw_user_list v
    WHERE v.client_id = _client_id
      AND v.user_type ~ '1'
      AND (
        v.user_id IS NULL -- 招待中
        OR
        (
          v.license_state = 'active'
          -- 💡 デモユーザーはどんな時でも絶対に含めない
          AND NOT EXISTS (
            SELECT 1 FROM public.com_t_user_role r 
            WHERE r.user_id = v.id AND r.role_id = 'demo_user'
          )
          -- 💡 モニターロールの切り替えロジック
          AND (
            _include_monitor = TRUE -- ONならモニターロールの人も通過させる
            OR
            NOT EXISTS ( -- OFFならモニターロールの人も弾く（通常表示）
              SELECT 1 FROM public.com_t_user_role r 
              WHERE r.user_id = v.id AND r.role_id = 'monitor'
            )
          )
        )
      )
    ORDER BY v.insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_user_list(BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_user_list(BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_user_list(BOOLEAN) TO authenticated;
