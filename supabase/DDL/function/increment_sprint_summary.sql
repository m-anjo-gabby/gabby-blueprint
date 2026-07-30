---------------------------------------------
-- スプリントドリル日次サマリーカウントアップ
---------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_sprint_summary(
  p_content_id UUID,
  p_question_count INT,
  p_assessment_count INT,
  p_question_type TEXT  -- 追加された問題種別 ('0', '4', '5', '6')
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid(); -- JWTから直接ユーザーIDを取得（セキュリティ向上）
  v_user_timezone TEXT;
  v_local_today DATE;
  
  -- 各問題種別の増分値を管理する変数
  v_speed_inc INT := 0;
  v_structure_inc INT := 0;
  v_builders_inc INT := 0;
  v_mastery_inc INT := 0;
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

  -- 3. 問題種別（question_type）に応じてインクリメント対象を振り分け
  IF p_question_type = '0' THEN
    v_speed_inc := p_question_count;
  ELSIF p_question_type = '4' THEN
    v_structure_inc := p_question_count;
  ELSIF p_question_type = '5' THEN
    v_builders_inc := p_question_count;
  ELSIF p_question_type = '6' THEN
    v_mastery_inc := p_question_count;
  -- 想定外の種別が渡された場合は、トータルのカウントのみ行うよう安全側に倒す
  END IF;

  -- 4. スプリントサマリーテーブルへUpsert
  INSERT INTO public.self_t_sprint_summary (
    user_id, 
    content_id, 
    training_date, 
    question_count, 
    assessment_count,
    speed_count,
    structure_count,
    builders_count,
    mastery_count
  )
  VALUES (
    v_user_id, 
    p_content_id, 
    v_local_today, 
    p_question_count, 
    p_assessment_count,
    v_speed_inc,
    v_structure_inc,
    v_builders_inc,
    v_mastery_inc
  )
  ON CONFLICT (user_id, content_id, training_date)
  DO UPDATE SET 
    question_count = self_t_sprint_summary.question_count + p_question_count,
    assessment_count = self_t_sprint_summary.assessment_count + p_assessment_count,
    speed_count = self_t_sprint_summary.speed_count + v_speed_inc,
    structure_count = self_t_sprint_summary.structure_count + v_structure_inc,
    builders_count = self_t_sprint_summary.builders_count + v_builders_inc,
    mastery_count = self_t_sprint_summary.mastery_count + v_mastery_inc,
    update_date = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 作成直後のデフォルト権限（PUBLIC / anon）を完全に剥奪
REVOKE EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT, TEXT) FROM anon;

-- ログイン済みのユーザー（authenticated）にのみ、実行権限を限定して付与
GRANT EXECUTE ON FUNCTION public.increment_sprint_summary(UUID, INT, INT, TEXT) TO authenticated;
