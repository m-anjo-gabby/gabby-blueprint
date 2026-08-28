---------------------------------------------
-- チャット新着メッセージ通知
---------------------------------------------
-- com_t_chat への INSERT トリガー。送信者以外の在室メンバー全員に通知行を作成/更新する。
-- dedup_key に room_id を用い ON CONFLICT DO UPDATE することで、同一ルームからの連続送信を
-- 1行（=「このルームに未読あり」）に集約する。これにより短時間に複数メッセージが送信されても
-- 通知が量産されず、payload/occurred_at が最新化され is_read が FALSE に戻るだけとなる。
-- 既読化は既存のチャット既読操作（markAsRead, packages/lib/chat/actions/messageActions.ts）に
-- 連動させる（同ファイル側で対応する通知行を is_read=TRUE に更新する）。
--
-- 対象UIは現状チャット画面が存在する admin/coach アプリのみ実装するが、
-- com_t_chat_room_user は user_type='STUDENT' の在室も許容する設計のため、
-- 本トリガーはuser_typeを問わず一律に通知行を作成する（将来student向けチャットUIが
-- 出来た際にそのまま利用できるようにするため）。
CREATE OR REPLACE FUNCTION public.notify_chat_new_message()
RETURNS TRIGGER AS $$
DECLARE
  v_sender_name TEXT;
BEGIN
  SELECT user_name INTO v_sender_name
  FROM public.com_m_user
  WHERE id = NEW.sender_user_id;

  INSERT INTO public.com_t_notification (
    user_id, notification_type, dedup_key, payload, link_path, occurred_at
  )
  SELECT
    cru.user_id,
    'CHAT_NEW_MESSAGE',
    NEW.room_id::text,
    jsonb_build_object(
      'room_id', NEW.room_id,
      'sender_user_id', NEW.sender_user_id,
      'sender_name', v_sender_name,
      'preview', LEFT(NEW.message, 100),
      'message_type', NEW.message_type
    ),
    '/chat/' || NEW.room_id,
    NEW.created_at
  FROM public.com_t_chat_room_user cru
  WHERE cru.room_id = NEW.room_id
    AND cru.user_id != NEW.sender_user_id
    AND cru.left_at IS NULL
  ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    occurred_at = EXCLUDED.occurred_at,
    is_read = FALSE,
    read_at = NULL,
    update_date = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_chat_message_insert_notify ON public.com_t_chat;
CREATE TRIGGER on_chat_message_insert_notify
AFTER INSERT ON public.com_t_chat
FOR EACH ROW EXECUTE PROCEDURE public.notify_chat_new_message();

-- トリガー専用のためAPI(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.notify_chat_new_message() FROM PUBLIC, anon, authenticated;
