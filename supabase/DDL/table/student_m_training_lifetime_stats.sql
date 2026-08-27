---------------------------------------------
-- DDL: student_m_training_lifetime_stats（学習実績サマリー：通算・連続日数管理）
---------------------------------------------
-- 月次履歴テーブル（self_t_word_summary / self_t_sprint_summary / self_t_sprint）を
-- 都度スキャンせずに、通算・連続学習実績を即時参照するための事前集計テーブル。
-- increment_word_summary() / increment_sprint_summary() の実行時、および
-- self_t_sprint への INSERT トリガー（sync_sprint_session_lifetime_stats()）経由で
-- update_training_lifetime_stats() が呼び出され、まとめて更新される
-- （アプリからの直接書き込みは想定しない）。
CREATE TABLE public.student_m_training_lifetime_stats (
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE PRIMARY KEY,
  total_active_days INT NOT NULL DEFAULT 0,
  current_streak_days INT NOT NULL DEFAULT 0,
  last_training_date DATE,
  total_words INT NOT NULL DEFAULT 0,
  total_phrases INT NOT NULL DEFAULT 0,
  total_assessments INT NOT NULL DEFAULT 0,
  total_sprint_sessions INT NOT NULL DEFAULT 0,
  total_sprint_answers INT NOT NULL DEFAULT 0,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.student_m_training_lifetime_stats IS '学習実績サマリー（通算学習日数・連続学習日数・最終トレーニング日・各種通算値を保持する事前集計テーブル）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_active_days IS '通算学習日数（単語ドリル・スプリントいずれかを実施したユニーク日数の累計）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.current_streak_days IS '連続学習日数（最終トレーニング日から連続して学習している日数。1日でも空くと1にリセット）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.last_training_date IS '最終トレーニング実施日（ユーザーのタイムゾーン基準のローカル日付）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_words IS '通算学習単語数（単語ドリル）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_phrases IS '通算学習フレーズ数（単語ドリル）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_assessments IS '通算発話評価回数（単語ドリル・スプリント[セッション/ドリル]の合算）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_sprint_sessions IS '通算スプリント実施本数（自主トレスプリントのセッション完了回数。ドリルモードは含まない）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.total_sprint_answers IS '通算スプリント回答数（自主トレスプリントのセッション内回答総数。ドリルモードは含まない）';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.insert_date IS '登録日時';
COMMENT ON COLUMN public.student_m_training_lifetime_stats.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.student_m_training_lifetime_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own training lifetime stats" ON public.student_m_training_lifetime_stats;

CREATE POLICY "Users can manage their own training lifetime stats" ON public.student_m_training_lifetime_stats
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
