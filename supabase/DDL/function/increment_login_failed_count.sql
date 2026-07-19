---------------------------------------------
-- ユーザーログイン失敗カウントアップ
---------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_login_failed_count(p_user_id UUID, p_max_attempts INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- 未ログイン状態からでも安全にマスタを更新できます
SET search_path = public
AS $$
DECLARE
    v_current_count INT;
    v_lockout_until TIMESTAMP WITH TIME ZONE := NULL;
BEGIN
    -- 現在の失敗回数を取得
    SELECT login_failed_count INTO v_current_count FROM public.com_m_user WHERE id = p_user_id;
    
    -- カウントを1増やす
    v_current_count := COALESCE(v_current_count, 0) + 1;
    
    -- 設定された上限回数を超えたら30分ロック
    IF v_current_count >= p_max_attempts THEN
        v_lockout_until := clock_timestamp() + INTERVAL '30 minutes';
    END IF;

    -- マスタを更新
    UPDATE public.com_m_user
    SET 
        login_failed_count = v_current_count,
        locked_until = v_lockout_until,
        update_date = clock_timestamp()
    WHERE id = p_user_id;
END;
$$;

-- 安全のため、一度すべてのデフォルト権限をリセット（剥奪）する
REVOKE EXECUTE ON FUNCTION public.increment_login_failed_count(UUID, INT) FROM PUBLIC, anon, authenticated;

-- 未ログイン画面の裏で動くNext.jsサーバー(Server Action)から、AdminClient(service_role)を用いて叩く運用に統一
-- anon への直接公開を停止し、service_role のみに絞ることで安全性を引き上げ、警告を解消します。
GRANT EXECUTE ON FUNCTION public.increment_login_failed_count(UUID, INT) TO service_role;
