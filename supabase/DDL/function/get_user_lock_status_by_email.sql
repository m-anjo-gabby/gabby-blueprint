---------------------------------------------
-- ユーザーロック状態取得
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_lock_status_by_email(p_email TEXT)
RETURNS TABLE (
    id UUID,
    user_type TEXT,
    login_failed_count INT,
    locked_until TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER -- Next.js(サーバー)から auth.users を安全にJOINして検索できます
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.user_type,
        u.login_failed_count,
        u.locked_until
    FROM public.com_m_user u
    JOIN auth.users a ON u.id = a.id
    WHERE a.email = p_email 
      AND u.delete_flg = '0'
    LIMIT 1;
END;
$$;

-- 1. 安全のため、一度すべてのデフォルト権限をリセット（剥奪）する
REVOKE EXECUTE ON FUNCTION public.get_user_lock_status_by_email(TEXT) FROM PUBLIC, anon, authenticated;

-- 一般ロール(anon, authenticated)への再付与をやめ、管理用サービスロール(service_role)のみに限定
-- これにより、外部API(/rest/v1/rpc)経由での一般ブラウザからの不正な直接実行を100%遮断し、警告を解消します。
GRANT EXECUTE ON FUNCTION public.get_user_lock_status_by_email(TEXT) TO service_role;
