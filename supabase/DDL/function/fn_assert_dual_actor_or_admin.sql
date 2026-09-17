---------------------------------------------
-- 権限チェック共通ヘルパー関数: 2名の当事者本人のいずれか または アドミン (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- cancel_session()・check_session_conflict()は「呼び出し者が対象のコーチ・生徒
-- どちらでもなければ、アドミンでない限り拒否する」という同一パターンを持つが、
-- cancel_session()は判定結果（＝アドミンによる代理操作かどうか）を後続のチケット
-- 返還ルール・通知文言の分岐にそのまま使うため、単純な例外送出だけのヘルパー
-- （fn_assert_actor_or_admin）では表現できない。本関数は判定結果をboolean
-- （is_admin_proxy）として返すことで、両方のニーズに対応する。
---------------------------------------------
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
    IF v_is_neither_actor AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION '%', p_message;
    END IF;
    RETURN v_is_neither_actor;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_assert_dual_actor_or_admin(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
