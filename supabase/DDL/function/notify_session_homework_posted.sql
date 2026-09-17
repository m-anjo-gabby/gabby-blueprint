---------------------------------------------
-- 宿題投稿・フォローアップコメント通知 (2026-09-12 追加)
---------------------------------------------
-- com_t_session_homework（宿題本体、1セッション1件）とcom_t_session_homework_comment
-- （フォローアップコメント、追記専用）へのINSERTトリガー。対象生徒にコーチからの
-- 宿題投稿/追記を通知する。
-- dedup_keyにsession_idを用いON CONFLICT DO UPDATEすることで、本体投稿・以後の
-- コメント追記のいずれも「このセッションの宿題に動きがあった」という1行に集約する
-- （notify_chat_new_message.sqlのCHAT_NEW_MESSAGEと同じ集約パターン）。
-- 既読化は通知一覧からの通常の既読操作に任せ、特別な連動処理は設けない
-- （宿題本体の内容は生徒がセッション結果画面を開けば必ず目に入るため）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_session_homework_posted()
RETURNS TRIGGER AS $$
DECLARE
  v_coach_name TEXT;
BEGIN
  SELECT user_name INTO v_coach_name
  FROM public.com_m_user
  WHERE id = NEW.coach_id;

  INSERT INTO public.com_t_notification (
    user_id, notification_type, dedup_key, payload, link_path, occurred_at
  )
  VALUES (
    NEW.student_id,
    'HOMEWORK_POSTED',
    NEW.session_id::text,
    jsonb_build_object(
      'session_id', NEW.session_id,
      'coach_id', NEW.coach_id,
      'coach_name', v_coach_name,
      'preview', LEFT(NEW.homework_text, 100)
    ),
    '/live-room/sessions/' || NEW.session_id || '/result',
    NEW.insert_date
  )
  ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    occurred_at = EXCLUDED.occurred_at,
    is_read = FALSE,
    read_at = NULL,
    update_date = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_session_homework_insert_notify ON public.com_t_session_homework;
CREATE TRIGGER on_session_homework_insert_notify
AFTER INSERT ON public.com_t_session_homework
FOR EACH ROW EXECUTE PROCEDURE public.notify_session_homework_posted();

-- トリガー専用のためAPI(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.notify_session_homework_posted() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_session_homework_comment_posted()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id UUID;
  v_student_id UUID;
  v_coach_name TEXT;
BEGIN
  SELECT h.session_id, h.student_id, u.user_name
  INTO v_session_id, v_student_id, v_coach_name
  FROM public.com_t_session_homework h
  JOIN public.com_m_user u ON u.id = NEW.coach_id
  WHERE h.homework_id = NEW.homework_id;

  INSERT INTO public.com_t_notification (
    user_id, notification_type, dedup_key, payload, link_path, occurred_at
  )
  VALUES (
    v_student_id,
    'HOMEWORK_POSTED',
    v_session_id::text,
    jsonb_build_object(
      'session_id', v_session_id,
      'coach_id', NEW.coach_id,
      'coach_name', v_coach_name,
      'preview', LEFT(NEW.comment_text, 100)
    ),
    '/live-room/sessions/' || v_session_id || '/result',
    NEW.insert_date
  )
  ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    occurred_at = EXCLUDED.occurred_at,
    is_read = FALSE,
    read_at = NULL,
    update_date = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_session_homework_comment_insert_notify ON public.com_t_session_homework_comment;
CREATE TRIGGER on_session_homework_comment_insert_notify
AFTER INSERT ON public.com_t_session_homework_comment
FOR EACH ROW EXECUTE PROCEDURE public.notify_session_homework_comment_posted();

-- トリガー専用のためAPI(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.notify_session_homework_comment_posted() FROM PUBLIC, anon, authenticated;
