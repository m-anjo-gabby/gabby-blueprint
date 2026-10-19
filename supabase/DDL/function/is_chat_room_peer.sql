---------------------------------------------
-- チャットルームの相手判定ヘルパー関数
---------------------------------------------
-- ログイン中のユーザーが参加中のルームに、指定したユーザーが参加している（または参加していた）かを返す。
-- com_m_user の RLS（"Chat room members can view each other"）から呼び、グループチャットで
-- 同じクライアントの受講生同士でも、同じルームの参加者の氏名・アイコンだけは参照できるようにする。
-- - 自分は参加中（left_at IS NULL）であること。相手は退出済みでもよい（過去の発言者の表示のため）。
-- - com_t_chat_room_user の RLS を経由すると評価が重くなるため、SECURITY DEFINER で直接判定する
--   （is_chat_room_member と同様のパターン）。
CREATE OR REPLACE FUNCTION public.is_chat_room_peer(p_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.com_t_chat_room_user me
    JOIN public.com_t_chat_room_user peer ON peer.room_id = me.room_id
    WHERE me.user_id = auth.uid()
      AND me.left_at IS NULL
      AND peer.user_id = p_user_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 全体公開(PUBLIC)を剥奪した上で、認証済みロールにのみクリーンに許可
REVOKE EXECUTE ON FUNCTION public.is_chat_room_peer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_room_peer(uuid) TO authenticated;
