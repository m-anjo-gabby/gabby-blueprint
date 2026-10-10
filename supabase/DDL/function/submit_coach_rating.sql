---------------------------------------------
-- 生徒によるコーチ評価の登録RPC (2026-10-10 追加)
-- 前提: table/com_t_coach_rating.sql, function/fn_coach_rating_targets.sql の作成が完了していること。
---------------------------------------------
-- 評価の対象（fn_coach_rating_targets）であることを確かめて1件登録する。登録後の変更・取り消しはできない。
-- 集計（com_t_coach_stats）は com_t_coach_rating のトリガーが同時に作り直す。
-- エラー（アプリ側で判別する接頭辞）:
--   INVALID_SCORE: 点数が1〜5の整数でない / FEEDBACK_TOO_LONG: コメントが2000文字を超える
--   ALREADY_RATED: 評価済み / NOT_ELIGIBLE: 評価の対象でない（受付期間外・担当外等）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_coach_rating(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_coaching_score smallint,
    p_friendliness_score smallint,
    p_recommendation_score smallint,
    p_feedback text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid := auth.uid();
    v_feedback text := NULLIF(btrim(p_feedback), '');
    v_rating_id uuid;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'NOT_ELIGIBLE: not authenticated';
    END IF;

    IF p_coaching_score IS NULL OR p_coaching_score NOT BETWEEN 1 AND 5
       OR p_friendliness_score IS NULL OR p_friendliness_score NOT BETWEEN 1 AND 5
       OR p_recommendation_score IS NULL OR p_recommendation_score NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'INVALID_SCORE: scores must be integers between 1 and 5';
    END IF;

    IF v_feedback IS NOT NULL AND char_length(v_feedback) > 2000 THEN
        RAISE EXCEPTION 'FEEDBACK_TOO_LONG: feedback exceeds 2000 characters';
    END IF;

    -- 評価済みかは本人の評価に限って判定する（他人の契約の評価の有無を探れないようにする）
    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_rating
        WHERE ticket_id = p_ticket_id AND coach_id = p_coach_id AND student_id = v_student_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_RATED: ticket % coach % is already rated', p_ticket_id, p_coach_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.fn_coach_rating_targets(v_student_id) tg
        WHERE tg.ticket_id = p_ticket_id AND tg.coach_id = p_coach_id
    ) THEN
        RAISE EXCEPTION 'NOT_ELIGIBLE: ticket % coach % is not open for rating', p_ticket_id, p_coach_id;
    END IF;

    INSERT INTO public.com_t_coach_rating (
        coach_id, student_id, ticket_id,
        coaching_score, friendliness_score, recommendation_score, feedback, source
    ) VALUES (
        p_coach_id, v_student_id, p_ticket_id,
        p_coaching_score, p_friendliness_score, p_recommendation_score, v_feedback, 1
    )
    RETURNING rating_id INTO v_rating_id;

    RETURN v_rating_id;
EXCEPTION
    -- 同時に2回送信された場合（一意制約）も評価済みとして扱う
    WHEN unique_violation THEN
        RAISE EXCEPTION 'ALREADY_RATED: ticket % coach % is already rated', p_ticket_id, p_coach_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_coach_rating(uuid, uuid, smallint, smallint, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_coach_rating(uuid, uuid, smallint, smallint, smallint, text) TO authenticated;
