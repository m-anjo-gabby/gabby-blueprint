---------------------------------------------
-- 5. ログイン中ユーザーのトレーニング実績一括取得関数
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_training_performance(
    _year_month TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_id UUID := auth.uid();
    _start_date DATE;
    _end_date DATE;
    _words_json JSONB;
    _sessions_json JSONB;
    _drills_json JSONB;
BEGIN
    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- 月の開始日と終了日を計算
    _start_date := (_year_month || '-01')::DATE;
    _end_date := (_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    -- 1. 単語ドリル履歴の取得
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'content_id', w.content_id,
        'training_date', w.training_date,
        'word_count', w.word_count,
        'phrase_count', w.phrase_count,
        'assessment_count', w.assessment_count,
        'update_date', w.update_date,
        'content_name', COALESCE(c.content_name, 'Training')
    )), '[]'::jsonb) INTO _words_json
    FROM public.self_t_word_summary w
    LEFT JOIN public.com_m_contents c ON c.content_id = w.content_id
    WHERE w.user_id = _user_id
      AND w.training_date BETWEEN _start_date AND _end_date;

    -- 2. スプリントセッション履歴の取得 (assessment_count を total_assessments から直接取得)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'self_sprint_id', s.self_sprint_id,
        'content_id', s.content_id,
        'total_answered', s.total_answered,
        'insert_date', s.insert_date,
        'assessment_count', s.total_assessments
    )), '[]'::jsonb) INTO _sessions_json
    FROM public.self_t_sprint s
    WHERE s.user_id = _user_id
      AND s.insert_date >= _start_date::TIMESTAMP WITH TIME ZONE
      AND s.insert_date <= (_end_date || ' 23:59:59.999')::TIMESTAMP WITH TIME ZONE;

    -- 3. スプリントドリル履歴の取得
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'summary_id', d.summary_id,
        'content_id', d.content_id,
        'training_date', d.training_date,
        'question_count', d.question_count,
        'assessment_count', d.assessment_count
    )), '[]'::jsonb) INTO _drills_json
    FROM public.self_t_sprint_summary d
    WHERE d.user_id = _user_id
      AND d.training_date BETWEEN _start_date AND _end_date;

    RETURN jsonb_build_object(
        'words', _words_json,
        'sprint_sessions', _sessions_json,
        'sprint_drills', _drills_json
    );
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_user_training_performance(TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_user_training_performance(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_user_training_performance(TEXT) TO authenticated;
