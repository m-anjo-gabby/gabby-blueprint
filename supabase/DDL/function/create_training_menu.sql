---------------------------------------------
-- 今日のトレーニングメニューの作成RPC
-- 前提: table/student_t_training_menu.sql, table/student_t_training_menu_item.sql の作成が完了していること。
---------------------------------------------
-- 呼び出した生徒の、生徒のタイムゾーンでの今日のメニューとやることを1トランザクションで作り、メニューIDを返す。
-- 同じ日のメニューが既にあれば（同時にホームを開いた等）作らず、そのIDを返す。
-- やることの中身はサーバーアクションが組んで渡す（packages/lib/trainingMenu/）。形は表の CHECK 制約で確かめる。
-- 日付は引数で受けず DB で決める（端末の時計・タイムゾーンで別の日のメニューを作らせない）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.create_training_menu(p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_menu_date date;
    v_menu_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'p_items must be an array of 1 to 10 items' USING ERRCODE = '22023';
    END IF;

    SELECT (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date
    INTO v_menu_date
    FROM public.com_m_user u
    WHERE u.id = v_user_id;

    INSERT INTO public.student_t_training_menu (user_id, menu_date)
    VALUES (v_user_id, v_menu_date)
    ON CONFLICT (user_id, menu_date) DO NOTHING
    RETURNING menu_id INTO v_menu_id;

    IF v_menu_id IS NULL THEN
        SELECT m.menu_id INTO v_menu_id
        FROM public.student_t_training_menu m
        WHERE m.user_id = v_user_id AND m.menu_date = v_menu_date;
        RETURN v_menu_id;
    END IF;

    INSERT INTO public.student_t_training_menu_item (
        menu_id, seq_no, item_type, content_id, video_id, question_type, difficulty_level, target_count
    )
    SELECT v_menu_id, x.seq_no, x.item_type, x.content_id, x.video_id, x.question_type, x.difficulty_level, COALESCE(x.target_count, 1)
    FROM jsonb_to_recordset(p_items) AS x(
        seq_no smallint, item_type smallint, content_id uuid, video_id uuid,
        question_type text, difficulty_level smallint, target_count smallint
    );

    RETURN v_menu_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_training_menu(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_training_menu(jsonb) TO authenticated;
