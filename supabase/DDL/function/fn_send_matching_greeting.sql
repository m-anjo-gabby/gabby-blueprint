---------------------------------------------
-- マッチング成立時のチャット開設・挨拶メッセージ送信ヘルパー関数 (2026-09-28 追加)
---------------------------------------------
-- 【背景】
-- マッチング成立（コーチの承認・アドミンの直接マッチング。コーチ交代後の再マッチングも含む）の
-- たびに、生徒とコーチの1対1チャットルームを用意し（fn_ensure_one_on_one_chat_room。開設済みなら
-- それを使う）、コーチから生徒へ挨拶メッセージを送る。fn_commit_matching_schedule() から、
-- 担当枠（com_m_lesson_schedule）の作成直後に呼ばれる。
--
-- 【文面】送信者はコーチ、種別は通常の TEXT（既存トリガー notify_chat_new_message により生徒に
-- チャット新着の通知が届く）。同じ2人の過去の担当枠（終了済みを含む）の有無で出し分ける。
--   1. 初めての担当             ... 専属コーチに選んでくれたことへのお礼と、初回セッションの案内
--   2. 同じ契約で別のコマも担当  ... 週の別のコマにも選んでくれたことへのお礼
--   3. 前の契約でも担当していた  ... 継続してくれたことへのお礼（契約更新）
-- 生徒名は com_m_user.user_name をそのまま使う（未設定の場合は名前を省く）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_send_matching_greeting(p_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_room_id uuid;
    v_greeting text;
    v_body text;
BEGIN
    SELECT schedule_id, ticket_id, student_id, coach_id INTO v_schedule
    FROM public.com_m_lesson_schedule
    WHERE schedule_id = p_schedule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    SELECT e.room_id INTO v_room_id
    FROM public.fn_ensure_one_on_one_chat_room(v_schedule.student_id, v_schedule.coach_id) e;

    SELECT 'Hi' || COALESCE(', ' || NULLIF(btrim(user_name), ''), '') || '!' INTO v_greeting
    FROM public.com_m_user
    WHERE id = v_schedule.student_id;

    IF EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule s
        WHERE s.student_id = v_schedule.student_id AND s.coach_id = v_schedule.coach_id
          AND s.schedule_id <> v_schedule.schedule_id AND s.ticket_id = v_schedule.ticket_id
    ) THEN
        v_body := 'Thank you for choosing me for another weekly session! See you in the live Coaching session.';
    ELSIF EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule s
        WHERE s.student_id = v_schedule.student_id AND s.coach_id = v_schedule.coach_id
          AND s.schedule_id <> v_schedule.schedule_id
    ) THEN
        v_body := 'Thank you for continuing your live Coaching sessions with me! See you in the next session.';
    ELSE
        v_body := 'Thank you for choosing me as your Gabby Coach! See you in the first live Coaching session.';
    END IF;

    INSERT INTO public.com_t_chat (room_id, sender_user_id, message, message_type)
    VALUES (v_room_id, v_schedule.coach_id, COALESCE(v_greeting, 'Hi!') || ' ' || v_body, 'TEXT');
END;
$$;

-- 内部処理専用（fn_commit_matching_schedule 経由以外での直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_send_matching_greeting(uuid) FROM PUBLIC, anon, authenticated;
