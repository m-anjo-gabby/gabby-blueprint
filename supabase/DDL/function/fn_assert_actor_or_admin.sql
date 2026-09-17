---------------------------------------------
-- 権限チェック共通ヘルパー関数: 単一の当事者本人 または アドミン (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- ライブセッション関連のRPC群で、「呼び出し者が対象レコードの当事者本人（コーチ/生徒/
-- 応答者など）でなければ、アドミンでない限り拒否する」という同一パターンが
-- 約15箇所に渡って以下の形でコピー&ペーストされていた。
--   IF <当事者列> <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
--       RAISE EXCEPTION '<エラーメッセージ>';
--   END IF;
-- 本関数はこのパターンを1箇所に集約する。p_actor_id にNULLを渡すことで、
-- 「当事者という概念自体がなく、常にアドミンのみ許可」（admin_book_session_direct等の
-- アドミン専用RPC）も同じ関数で表現できる（auth.uid()は認証済みリクエストでは常に
-- NOT NULLのため、IS DISTINCT FROM NULLは常にTRUEになり、アドミン判定のみが効く）。
--
-- 【対象外にしているケース】
-- create_session_booking_request()・finalize_session()は、意図的にアドミンの代理実行を
-- 許可しない（前者はアドミン専用の別RPC(admin_book_session_direct)を用意している、
-- 後者は「コーチが実際にその場に立ち会って終了操作をした」という事実を表すため）。
-- これらは本関数を使わず、従来通り素のIF文のままとする。
-- また、2名の当事者（例: コーチ・生徒どちらでも可、かつどちらでもなければアドミン代理と
-- みなす）を許可するケース（cancel_session/check_session_conflict）は、判定結果
-- （アドミン代理かどうか）を呼び出し元が後続処理で使うため、戻り値を持つ
-- fn_assert_dual_actor_or_admin() を別途用意する。
---------------------------------------------
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
    IF auth.uid() IS DISTINCT FROM p_actor_id AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION '%', p_message;
    END IF;
END;
$$;

-- 内部処理専用（他のSECURITY DEFINER関数から呼ばれる想定で、authenticatedへの直接公開は不要）
REVOKE EXECUTE ON FUNCTION public.fn_assert_actor_or_admin(uuid, text) FROM PUBLIC, anon, authenticated;
