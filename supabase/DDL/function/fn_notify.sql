---------------------------------------------
-- 通知INSERT共通ヘルパー関数 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- ライブセッション関連のRPC群が、それぞれ独自に
--   INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
--   VALUES (...);
-- を約15箇所で直接記述しており、com_t_notificationのカラム構成を知っている箇所が
-- 分散していた。本関数に集約し、呼び出し元は「誰に・何を・どこへのリンクで」のみを
-- 意識すればよいようにする。内部処理専用（authenticatedへの直接公開は不要。
-- 任意のuser_idへ通知を送れてしまうため、SECURITY DEFINER関数経由以外での実行は許さない）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify(
    p_user_id uuid,
    p_notification_type text,
    p_payload jsonb,
    p_link_path text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (p_user_id, p_notification_type, p_payload, p_link_path);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_notify(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
