---------------------------------------------
-- DDL: self_t_sprint (自主トレスプリント結果・履歴)
---------------------------------------------
CREATE TABLE public.self_t_sprint (
  self_sprint_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  sprint_type TEXT NOT NULL,            -- '0': 汎用スプリント, '1': コーパススプリント
  content_id UUID NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,  -- コンテンツID
  question_type TEXT NOT NULL,          -- '0': Speed, '4': Structure, '5': Builders, '6': Mastery
  answer_type TEXT NOT NULL,            -- '0': YES回答, '1': NO回答
  difficulty_level SMALLINT NOT NULL,   -- 0 (Basic) 〜 10
  time_limit_sec SMALLINT NOT NULL,     -- 60, 90, 120, 150
  total_answered SMALLINT NOT NULL,     -- タイムアップまでに答えた総問題数
  total_assessments SMALLINT NOT NULL,  -- タイムアップまでに発話評価した回数
  answered_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.self_t_sprint IS '自主トレスプリント結果・履歴管理テーブル';
COMMENT ON COLUMN public.self_t_sprint.self_sprint_id IS 'スプリント結果ユニークID (UUID)';
COMMENT ON COLUMN public.self_t_sprint.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.self_t_sprint.sprint_type IS 'スプリント種別';
COMMENT ON COLUMN public.self_t_sprint.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.self_t_sprint.question_type IS 'スプリント問題種別 (''0'': Speed, ''4'': Structure, ''5'': Builders, ''6'': Mastery)';
COMMENT ON COLUMN public.self_t_sprint.answer_type IS '解答種別（''0'': YES回答, ''1'': NO回答）';
COMMENT ON COLUMN public.self_t_sprint.difficulty_level IS '難易度レベル (0: Basic 〜 10)';
COMMENT ON COLUMN public.self_t_sprint.time_limit_sec IS '制限時間 (60, 90, 120, 150秒)';
COMMENT ON COLUMN public.self_t_sprint.total_answered IS '総回答数';
COMMENT ON COLUMN public.self_t_sprint.total_assessments IS '総発話評価数';
COMMENT ON COLUMN public.self_t_sprint.answered_history IS '実施問題の履歴情報(JSON)';
COMMENT ON COLUMN public.self_t_sprint.insert_date IS '登録日時';
COMMENT ON COLUMN public.self_t_sprint.update_date IS '更新日時';

CREATE INDEX IF NOT EXISTS idx_self_t_sprint_user_type 
  ON public.self_t_sprint (user_id, question_type, difficulty_level);

CREATE INDEX IF NOT EXISTS idx_self_t_sprint_user_insert_date 
  ON public.self_t_sprint (user_id, insert_date DESC);

CREATE INDEX IF NOT EXISTS idx_self_t_sprint_content_id 
  ON public.self_t_sprint (content_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.self_t_sprint ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own sprint scores" ON public.self_t_sprint;
DROP POLICY IF EXISTS "Managers can view client's sprint scores" ON public.self_t_sprint;

CREATE POLICY "Users can manage their own sprint scores" ON public.self_t_sprint
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Managers can view client's sprint scores" ON public.self_t_sprint
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_user u
        WHERE u.id = public.self_t_sprint.user_id
          AND u.client_id = public.get_jwt_client_id()
    )
);
