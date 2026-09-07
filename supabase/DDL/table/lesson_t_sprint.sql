---------------------------------------------
-- DDL: lesson_t_sprint (コーチ主導レッスンスプリント結果・履歴)
---------------------------------------------
CREATE TABLE public.lesson_t_sprint (
  lesson_sprint_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  sprint_type TEXT NOT NULL,            -- '0': 汎用スプリント, '1': コーパススプリント
  content_id UUID NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,  -- コンテンツID
  question_type TEXT NOT NULL,          -- '0': Speed, '4': Structure, '5': Builders, '6': Mastery
  answer_type TEXT NOT NULL,            -- '0': YES回答, '1': NO回答
  difficulty_level SMALLINT NOT NULL,   -- 0 (Basic) 〜 10
  time_limit_sec SMALLINT NOT NULL,     -- 60, 90, 120, 150
  total_answered SMALLINT NOT NULL,     -- タイムアップまでに提示した総問題数
  total_evaluated SMALLINT NOT NULL,    -- タイムアップまでにコーチが1-5評価した回数（スキップ除く）
  paused_duration_sec SMALLINT NOT NULL DEFAULT 0, -- 一時停止していた合計秒数（参考値）
  session_note TEXT,                    -- スプリント中に記録したコーチのメモ
  answered_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.lesson_t_sprint IS 'コーチ主導レッスンスプリント結果・履歴管理テーブル';
COMMENT ON COLUMN public.lesson_t_sprint.lesson_sprint_id IS 'レッスンスプリント結果ユニークID (UUID)';
COMMENT ON COLUMN public.lesson_t_sprint.coach_id IS '実施したコーチのユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.lesson_t_sprint.student_id IS '対象の生徒のユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.lesson_t_sprint.sprint_type IS 'スプリント種別';
COMMENT ON COLUMN public.lesson_t_sprint.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.lesson_t_sprint.question_type IS 'スプリント問題種別 (''0'': Speed, ''4'': Structure, ''5'': Builders, ''6'': Mastery)';
COMMENT ON COLUMN public.lesson_t_sprint.answer_type IS '解答種別（''0'': YES回答, ''1'': NO回答）';
COMMENT ON COLUMN public.lesson_t_sprint.difficulty_level IS '難易度レベル (0: Basic 〜 10)';
COMMENT ON COLUMN public.lesson_t_sprint.time_limit_sec IS '制限時間 (60, 90, 120, 150秒)';
COMMENT ON COLUMN public.lesson_t_sprint.total_answered IS '総提示問題数';
COMMENT ON COLUMN public.lesson_t_sprint.total_evaluated IS 'コーチが1-5評価した総回数（スキップ除く）';
COMMENT ON COLUMN public.lesson_t_sprint.paused_duration_sec IS '一時停止していた合計秒数（参考値）';
COMMENT ON COLUMN public.lesson_t_sprint.session_note IS 'スプリント中に記録したコーチのメモ';
COMMENT ON COLUMN public.lesson_t_sprint.answered_history IS '実施問題の履歴情報(JSON): question_id, group_id, seq_no, is_skipped, score(1-5|null), highlighted_word_indices';
COMMENT ON COLUMN public.lesson_t_sprint.insert_date IS '登録日時';
COMMENT ON COLUMN public.lesson_t_sprint.update_date IS '更新日時';

CREATE INDEX IF NOT EXISTS idx_lesson_t_sprint_coach_student
  ON public.lesson_t_sprint (coach_id, student_id, insert_date DESC);

CREATE INDEX IF NOT EXISTS idx_lesson_t_sprint_student
  ON public.lesson_t_sprint (student_id, insert_date DESC);

CREATE INDEX IF NOT EXISTS idx_lesson_t_sprint_content_id
  ON public.lesson_t_sprint (content_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.lesson_t_sprint ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can manage lesson sprints they ran" ON public.lesson_t_sprint;
DROP POLICY IF EXISTS "Students can view their own lesson sprints" ON public.lesson_t_sprint;

-- [コーチ] 自分が実施したレッスンスプリントの全操作（作成・閲覧）が可能
CREATE POLICY "Coaches can manage lesson sprints they ran" ON public.lesson_t_sprint
FOR ALL TO authenticated
USING (coach_id = auth.uid() OR public.get_jwt_user_type() = '0')
WITH CHECK (coach_id = auth.uid());

-- [生徒] 自分が対象のレッスンスプリント結果を閲覧可能
CREATE POLICY "Students can view their own lesson sprints" ON public.lesson_t_sprint
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
);
