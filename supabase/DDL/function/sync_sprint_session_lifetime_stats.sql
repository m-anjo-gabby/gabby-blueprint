---------------------------------------------
-- 自主トレスプリント（セッションモード）完了時の学習実績サマリー同期
---------------------------------------------
-- self_t_sprint は createSprintScoreAction() から直接 INSERT される
-- （increment_word_summary/increment_sprint_summary のような RPC 経由ではない）ため、
-- INSERT トリガーで student_m_training_lifetime_stats を同期する。
-- これにより「タイムドスプリントのみを実施したユーザー」でも通算学習日数・連続学習日数・
-- 通算スプリント本数/回答数/発話評価回数が正しく反映される。
CREATE OR REPLACE FUNCTION public.sync_sprint_session_lifetime_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_user_timezone TEXT;
  v_local_date DATE;
BEGIN
  SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_user_timezone
  FROM public.com_m_user
  WHERE id = NEW.user_id AND delete_flg = '0';

  v_local_date := (NEW.insert_date AT TIME ZONE v_user_timezone)::date;

  PERFORM public.update_training_lifetime_stats(
    NEW.user_id,
    v_local_date,
    p_assessment_delta => NEW.total_assessments,
    p_sprint_session_delta => 1,
    p_sprint_answer_delta => NEW.total_answered
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_sprint_session_insert ON public.self_t_sprint;
CREATE TRIGGER on_sprint_session_insert
AFTER INSERT ON public.self_t_sprint
FOR EACH ROW EXECUTE PROCEDURE public.sync_sprint_session_lifetime_stats();

-- トリガー専用のためAPI(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.sync_sprint_session_lifetime_stats() FROM PUBLIC, anon, authenticated;
