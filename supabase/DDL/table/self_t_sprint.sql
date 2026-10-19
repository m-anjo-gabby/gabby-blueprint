-- =========================================================================
-- self_t_sprint: スプリントの自主トレの結果
-- =========================================================================
-- 問題ごとの回答は answered_history（JSONB の配列）に持つ。旧システムの明細テーブルが巨大になったため、
-- 1回の結果を1行にまとめている。保存時にアプリ側（zod）で形を検証し、DB では配列であることだけを確かめる。
-- コーチには日ごとの件数（self_t_sprint_summary）だけを見せ、本テーブルは見せない。
-- =========================================================================

-- @schema public.self_t_sprint
CREATE TABLE public.self_t_sprint (
    self_sprint_id           uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    sprint_type              text         NOT NULL,
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE RESTRICT,
    question_type            text         NOT NULL,
    answer_type              text         NOT NULL,
    difficulty_level         smallint     NOT NULL,
    time_limit_sec           smallint     NOT NULL,
    total_answered           smallint     NOT NULL,
    total_assessments        smallint     NOT NULL,
    answered_history         jsonb        NOT NULL DEFAULT '[]'::jsonb,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_self_sprint_types CHECK ((sprint_type = ANY (ARRAY['0'::text, '1'::text])) AND (question_type = ANY (ARRAY['0'::text, '4'::text, '5'::text, '6'::text])) AND (answer_type = ANY (ARRAY['0'::text, '1'::text]))),
    CONSTRAINT self_t_sprint_answered_history_is_array CHECK (jsonb_typeof(answered_history) = 'array'::text)
);

COMMENT ON TABLE public.self_t_sprint IS '自主トレスプリント結果・履歴管理テーブル';
COMMENT ON COLUMN public.self_t_sprint.self_sprint_id IS 'スプリント結果ユニークID (UUID)';
COMMENT ON COLUMN public.self_t_sprint.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.self_t_sprint.sprint_type IS 'スプリント種別（''0'': 汎用スプリント, ''1'': コーパススプリント）';
COMMENT ON COLUMN public.self_t_sprint.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.self_t_sprint.question_type IS 'スプリント問題種別 (''0'': Speed, ''4'': Structure, ''5'': Builders, ''6'': Mastery)';
COMMENT ON COLUMN public.self_t_sprint.answer_type IS '解答種別（''0'': YES回答, ''1'': NO回答）';
COMMENT ON COLUMN public.self_t_sprint.difficulty_level IS '難易度レベル (0: Basic 〜 10)';
COMMENT ON COLUMN public.self_t_sprint.time_limit_sec IS '制限時間（秒。タイムアタックは 60・90・120・150）';
COMMENT ON COLUMN public.self_t_sprint.total_answered IS 'タイムアップまでに答えた総問題数';
COMMENT ON COLUMN public.self_t_sprint.total_assessments IS '総発話評価数';
COMMENT ON COLUMN public.self_t_sprint.answered_history IS '実施問題の履歴情報(JSON配列。出題順): question_id, group_id, seq_no, is_skipped, assessment(発話評価。未評価はnull: total_score(0-100), analysis(結果画面のフィードバック用の詳細。古い記録には無い))。2026-06以前の記録には is_skipped・group_id・seq_no が無い要素がある';
COMMENT ON COLUMN public.self_t_sprint.insert_date IS '登録日時';
COMMENT ON COLUMN public.self_t_sprint.update_date IS '更新日時';

CREATE INDEX idx_self_t_sprint_content_id ON public.self_t_sprint (content_id);
CREATE INDEX idx_self_t_sprint_user_insert_date ON public.self_t_sprint (user_id, insert_date DESC);
CREATE INDEX idx_self_t_sprint_user_type ON public.self_t_sprint (user_id, question_type, difficulty_level);

CREATE TRIGGER on_sprint_session_insert AFTER INSERT ON public.self_t_sprint FOR EACH ROW EXECUTE FUNCTION public.sync_sprint_session_lifetime_stats();
CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.self_t_sprint FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.self_t_sprint ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sprint scores" ON public.self_t_sprint FOR ALL TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);
-- @end-schema
