-- 権限の確認の共通の関数: 2名の当事者本人のどちらか または システム管理者
-- どちらの当事者でもなく、システム管理者（is_system_admin()）でもなければ例外を投げる。
-- 戻り値は「当事者でない＝システム管理者の代理の操作か」で、cancel_session がチケットの返還・通知の文言の分岐に使う。
-- service_role（サーバー）・JWT の無い呼び出しは user_type が NULL のため通す（fn_assert_actor_or_admin と同じ）。
CREATE OR REPLACE FUNCTION public.fn_assert_dual_actor_or_admin(
    p_actor_id_1 uuid,
    p_actor_id_2 uuid,
    p_message text DEFAULT 'not authorized'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_is_neither_actor boolean;
BEGIN
    v_is_neither_actor := (auth.uid() IS DISTINCT FROM p_actor_id_1 AND auth.uid() IS DISTINCT FROM p_actor_id_2);
    IF v_is_neither_actor AND public.get_jwt_user_type() IS NOT NULL AND NOT public.is_system_admin() THEN
        RAISE EXCEPTION '%', p_message;
    END IF;
    RETURN v_is_neither_actor;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_assert_dual_actor_or_admin(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
