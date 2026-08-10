---------------------------------------------
-- チャットルーム参加者判定ヘルパー関数
-- com_t_chat_room_user 自体のRLSで自己参照すると再帰になるため、
-- SECURITY DEFINER で回避する（get_monitor_user_list と同様のパターン）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.is_chat_room_member(p_room_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.com_t_chat_room_user
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND left_at IS NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 全体公開(PUBLIC)を剥奪した上で、認証済みロールにのみクリーンに許可
REVOKE EXECUTE ON FUNCTION public.is_chat_room_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_room_member(uuid) TO authenticated;
