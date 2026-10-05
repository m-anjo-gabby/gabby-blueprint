---------------------------------------------
-- 1対1チャットルームの取得・開設ヘルパー関数 (2026-09-28 追加)
---------------------------------------------
-- 【背景】
-- 2人の間の有効な1対1チャットルームを返し、無ければ開設する処理を1か所に集約する。
-- 呼び出し元は次の2つ。
--   - fn_send_matching_greeting() ... マッチング成立時の自動開設（生徒×コーチ）
--   - packages/lib/chat/actions/roomActions.ts の createOneOnOneChatRoom ... アドミンの手動開設
--     （参加者の種別チェック等の入力検証はアプリ側で行い、検索・開設だけを本関数に任せる）
--
-- 【既存ルームの判定】
-- 閉じられておらず（closed_at IS NULL）、2人とも在室中（left_at IS NULL）で、在室者がちょうど
-- 2人のルームを「2人の1対1ルーム」とみなす。該当が複数ある場合は最も古いルームを返す。
--
-- 【同時実行】
-- 同じ2人に対する開設が同時に走ると（週2回契約の2コマを続けて承認した等）、どちらも
-- 「ルーム無し」と判定して2つ開設し得る。2人のIDの組ごとのアドバイザリロックで直列化する
-- （IDを昇順に並べてキーにするため、引数の順序に関わらず同じロックになる）。
-- fn_commit_matching_schedule() から呼ばれる場合は「コーチ×曜日」のロックの後に取得するが、
-- 本ロックの後に別のロックを取る処理は無いため、デッドロックは起こらない。
--
-- 参加者行の user_type には com_m_user.user_type（0:管理者 / 1:生徒 / 2:コーチ）をそのまま保存する
-- （アドミンの手動開設と同じ値）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ensure_one_on_one_chat_room(p_user_a uuid, p_user_b uuid)
RETURNS TABLE (room_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_room_id uuid;
BEGIN
    IF p_user_a IS NULL OR p_user_b IS NULL OR p_user_a = p_user_b THEN
        RAISE EXCEPTION 'two different users are required';
    END IF;
    IF (SELECT count(*) FROM public.com_m_user WHERE id IN (p_user_a, p_user_b)) <> 2 THEN
        RAISE EXCEPTION 'user not found: % / %', p_user_a, p_user_b;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        'chat_1on1:' || LEAST(p_user_a, p_user_b)::text || ':' || GREATEST(p_user_a, p_user_b)::text, 0
    ));

    SELECT r.room_id INTO v_room_id
    FROM public.com_t_chat_room r
    WHERE r.closed_at IS NULL
      AND EXISTS (SELECT 1 FROM public.com_t_chat_room_user u WHERE u.room_id = r.room_id AND u.user_id = p_user_a AND u.left_at IS NULL)
      AND EXISTS (SELECT 1 FROM public.com_t_chat_room_user u WHERE u.room_id = r.room_id AND u.user_id = p_user_b AND u.left_at IS NULL)
      AND (SELECT count(*) FROM public.com_t_chat_room_user u WHERE u.room_id = r.room_id AND u.left_at IS NULL) = 2
    ORDER BY r.created_at
    LIMIT 1;

    IF v_room_id IS NOT NULL THEN
        RETURN QUERY SELECT v_room_id, false;
        RETURN;
    END IF;

    INSERT INTO public.com_t_chat_room (room_type) VALUES ('1ON1') RETURNING com_t_chat_room.room_id INTO v_room_id;

    INSERT INTO public.com_t_chat_room_user (room_id, user_id, user_type)
    SELECT v_room_id, m.id, m.user_type
    FROM public.com_m_user m
    WHERE m.id IN (p_user_a, p_user_b);

    RETURN QUERY SELECT v_room_id, true;
END;
$$;

-- 内部処理（fn_send_matching_greeting）とアドミンの手動開設（service_role）専用
REVOKE EXECUTE ON FUNCTION public.fn_ensure_one_on_one_chat_room(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ensure_one_on_one_chat_room(uuid, uuid) TO service_role;
