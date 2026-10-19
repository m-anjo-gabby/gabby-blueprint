-- =========================================================================
-- student_m_training_lifetime_stats: 学習実績の通算・連続日数
-- =========================================================================
-- 日ごとの集計や結果のテーブル（self_t_word_summary / self_t_sprint_summary / self_t_sprint）を毎回走査せずに、
-- 通算・連続の学習実績を引くための事前の集計。increment_word_summary() / increment_sprint_summary() と、
-- self_t_sprint への INSERT のトリガー（sync_sprint_session_lifetime_stats()）から update_training_lifetime_stats() が更新する
-- （アプリから直接書き込まない）。
-- =========================================================================

-- @schema public.student_m_training_lifetime_stats
CREATE TABLE public.student_m_training_lifetime_stats (
    user_id                  uuid         PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    total_active_days        integer      NOT NULL DEFAULT 0,
    current_streak_days      integer      NOT NULL DEFAULT 0,
    last_training_date       date,
    total_words              integer      NOT NULL DEFAULT 0,
    total_phrases            integer      NOT NULL DEFAULT 0,
    total_assessments        integer      NOT NULL DEFAULT 0,
    total_sprint_sessions    integer      NOT NULL DEFAULT 0,
    total_sprint_answers     integer      NOT NULL DEFAULT 0,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    first_training_date      date
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
COMMENT ON COLUMN public.student_m_training_lifetime_stats.first_training_date IS '初回トレーニング実施日（ユーザーのタイムゾーン基準のローカル日付。生徒ホームの「これまでの歩み」の開始日）';

CREATE TRIGGER on_training_lifetime_stats_change AFTER INSERT OR UPDATE ON public.student_m_training_lifetime_stats FOR EACH ROW EXECUTE FUNCTION public.notify_training_milestone();
CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.student_m_training_lifetime_stats FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.student_m_training_lifetime_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own training lifetime stats" ON public.student_m_training_lifetime_stats FOR ALL TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);
-- @end-schema
