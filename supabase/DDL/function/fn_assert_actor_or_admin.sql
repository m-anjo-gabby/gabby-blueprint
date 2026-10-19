-- 権限の確認の共通の関数: 当事者本人 または システム管理者
-- 呼び出し元が p_actor_id の本人（コーチ・生徒・応答者等）でもシステム管理者（is_system_admin()）でもなければ、例外を投げる。
-- p_actor_id に NULL を渡すと、システム管理者だけを許す（admin_book_session_direct 等の admin 専用の RPC）。
-- 教材担当（user_type は管理者だが roles に admin を持たない）は止める。
-- service_role（サーバー）・JWT の無い呼び出しは user_type が NULL のため通す（呼び出し側のサーバーで確かめる）。
-- 2名の当事者のどちらでもよい場合で、代理の操作かどうかを後で使うもの（cancel_session・check_session_conflict）は
-- fn_assert_dual_actor_or_admin() を使う。代理の操作を許さない RPC（create_session_booking_request・finalize_session）は、
-- この関数を使わず本人だけを確かめる。
CREATE OR REPLACE FUNCTION public.fn_assert_actor_or_admin(
    p_actor_id uuid,
    p_message text DEFAULT 'not authorized'
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS DISTINCT FROM p_actor_id AND public.get_jwt_user_type() IS NOT NULL AND NOT public.is_system_admin() THEN
        RAISE EXCEPTION '%', p_message;
    END IF;
END;
$$;

-- 内部処理専用（他のSECURITY DEFINER関数から呼ばれる想定で、authenticatedへの直接公開は不要）
REVOKE EXECUTE ON FUNCTION public.fn_assert_actor_or_admin(uuid, text) FROM PUBLIC, anon, authenticated;
