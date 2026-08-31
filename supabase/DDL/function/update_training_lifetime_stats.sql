---------------------------------------------
-- 学習実績サマリー（通算・連続日数、各種通算値）更新関数
---------------------------------------------
-- increment_word_summary() / increment_sprint_summary() /
-- sync_sprint_session_lifetime_stats()（self_t_sprint INSERTトリガー）の
-- 内部からのみ呼び出される。
-- p_training_date は呼び出し元で算出済みの「ユーザーのタイムゾーン基準のローカル日付」を渡すこと。
-- p_*_delta 系は今回の呼び出しで加算したい差分値（該当しない場合は未指定=0でよい）。
CREATE OR REPLACE FUNCTION public.update_training_lifetime_stats(
  p_user_id UUID,
  p_training_date DATE,
  p_word_delta INT DEFAULT 0,
  p_phrase_delta INT DEFAULT 0,
  p_assessment_delta INT DEFAULT 0,
  p_sprint_session_delta INT DEFAULT 0,
  p_sprint_answer_delta INT DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.student_m_training_lifetime_stats (
    user_id, total_active_days, current_streak_days, last_training_date,
    total_words, total_phrases, total_assessments,
    total_sprint_sessions, total_sprint_answers
  )
  VALUES (
    p_user_id, 1, 1, p_training_date,
    p_word_delta, p_phrase_delta, p_assessment_delta,
    p_sprint_session_delta, p_sprint_answer_delta
  )
  ON CONFLICT (user_id) DO UPDATE SET
    -- 日付起点の項目は、過去日付での呼び出し（クロックずれ等の異常系）を無視して安全側に倒す
    total_active_days = CASE
      WHEN p_training_date < student_m_training_lifetime_stats.last_training_date
        THEN student_m_training_lifetime_stats.total_active_days
      WHEN student_m_training_lifetime_stats.last_training_date = p_training_date
        THEN student_m_training_lifetime_stats.total_active_days
      ELSE student_m_training_lifetime_stats.total_active_days + 1
    END,
    current_streak_days = CASE
      WHEN p_training_date < student_m_training_lifetime_stats.last_training_date
        THEN student_m_training_lifetime_stats.current_streak_days
      WHEN student_m_training_lifetime_stats.last_training_date = p_training_date
        THEN student_m_training_lifetime_stats.current_streak_days
      WHEN student_m_training_lifetime_stats.last_training_date = p_training_date - 1
        THEN student_m_training_lifetime_stats.current_streak_days + 1
      ELSE 1
    END,
    last_training_date = GREATEST(student_m_training_lifetime_stats.last_training_date, p_training_date),
    -- 通算カウンタ系は呼び出し順序に依存しない単純加算のため、日付の前後に関わらず常に加算する
    total_words = student_m_training_lifetime_stats.total_words + p_word_delta,
    total_phrases = student_m_training_lifetime_stats.total_phrases + p_phrase_delta,
    total_assessments = student_m_training_lifetime_stats.total_assessments + p_assessment_delta,
    total_sprint_sessions = student_m_training_lifetime_stats.total_sprint_sessions + p_sprint_session_delta,
    total_sprint_answers = student_m_training_lifetime_stats.total_sprint_answers + p_sprint_answer_delta,
    update_date = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 呼び出し元の内部関数群からのみ呼び出される内部関数のため、
-- authenticated を含め、外部からの直接実行権限は付与しない
REVOKE EXECUTE ON FUNCTION public.update_training_lifetime_stats(UUID, DATE, INT, INT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
