---------------------------------------------
-- 単語ドリル日次サマリーカウントアップ
---------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_word_summary(
  p_content_id UUID,
  p_word_count INT,
  p_phrase_count INT,
  p_assessment_count INT
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid(); -- JWTから直接ユーザーIDを取得（セキュリティ向上）
  v_user_timezone TEXT;
  v_local_today DATE;
BEGIN
  -- 認証されていない場合は何もせず終了（安全策）
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 1. ユーザーマスタからタイムゾーンを取得（デフォルトは 'Asia/Tokyo'）
  SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_user_timezone
  FROM public.com_m_user
  WHERE id = v_user_id AND delete_flg = '0';

  -- 2. ユーザーのタイムゾーン基準で現在日付を切り出す
  v_local_today := (CURRENT_TIMESTAMP AT TIME ZONE v_user_timezone)::date;

  -- 3. サマリーテーブルへUpsert
  INSERT INTO public.self_t_word_summary (
    user_id, content_id, training_date, word_count, phrase_count, assessment_count
  )
  VALUES (
    v_user_id, 
    p_content_id, 
    v_local_today, 
    p_word_count, 
    p_phrase_count,
    p_assessment_count
  )
  ON CONFLICT (user_id, content_id, training_date)
  DO UPDATE SET
    word_count = self_t_word_summary.word_count + p_word_count,
    phrase_count = self_t_word_summary.phrase_count + p_phrase_count,
    assessment_count = self_t_word_summary.assessment_count + p_assessment_count,
    update_date = NOW();

  -- 4. 学習実績サマリー（通算学習日数・連続学習日数・最終トレーニング日・通算単語数等）を更新
  PERFORM public.update_training_lifetime_stats(
    v_user_id,
    v_local_today,
    p_word_delta => p_word_count,
    p_phrase_delta => p_phrase_count,
    p_assessment_delta => p_assessment_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 作成直後のデフォルト権限（PUBLIC = 誰でも実行可能）を完全に剥奪
REVOKE EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) FROM anon;

-- ログイン済みのユーザー（authenticated）にのみ、実行権限を限定して付与
GRANT EXECUTE ON FUNCTION public.increment_word_summary(UUID, INT, INT, INT) TO authenticated;
