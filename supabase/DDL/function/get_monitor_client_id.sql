---------------------------------------------
-- モニター用RPCの呼び出し元確認ヘルパー（内部共通ヘルパー）
---------------------------------------------
-- 生徒モニタリング画面（apps/student /monitor）の各RPC（get_monitor_user_list / get_monitor_word_history /
-- get_monitor_sprint_history / get_monitor_sprint_drill_history）の先頭で呼び、呼び出し元が
-- モニターロール（com_t_user_role.role_id = 'monitor'）を持つ場合だけ、JWT の client_id を返す。
-- - client_id が JWT に無い場合、モニターロールを持たない場合は例外にする
--   （同じクライアントの一般の受講生が RPC を直接呼んでも、他の受講生の一覧・実績を読めないようにする）。
-- - ロールは JWT ではなく DB（com_t_user_role）で判定する（画面の表示可否 apps/student (app)/layout.tsx と同じ基準）。
-- - private スキーマに置き、SECURITY DEFINER の各RPCの内部からのみ呼び出す（authenticated には公開しない）。
CREATE OR REPLACE FUNCTION private.get_monitor_client_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = auth.uid() AND r.role_id = 'monitor'
    ) THEN
        RAISE EXCEPTION 'Monitor role required.' USING ERRCODE = '42501';
    END IF;

    RETURN _client_id;
END;
$$;

-- 内部ヘルパーのため外部公開しない（SECURITY DEFINER関数の内部からのみ呼び出される）
REVOKE ALL ON FUNCTION private.get_monitor_client_id() FROM PUBLIC, anon, authenticated;
