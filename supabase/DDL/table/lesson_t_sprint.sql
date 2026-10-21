-- =========================================================================
-- lesson_t_sprint: コーチが実施するスプリント（Lesson Sprint）の結果
-- =========================================================================
-- 【参照・書き込み】
-- コーチは自分が実施した結果を作成・参照でき、生徒は自分が対象の結果を参照できる。
--
-- 【ライブセッションとの紐づけ】
-- session_id でライブセッションの回（com_t_session）に紐づける（準備・実施画面からの起動、結果画面の表示に使う）。
-- 外部のZoom等で実施した場合やセッションと関係なく実施する場合もあるため NULL を許す。
-- session_id を入れる場合は、そのコーチが担当し、かつ student_id が一致するセッションであることを
-- ポリシーで確かめる（他のコーチ・生徒のセッションへの誤った紐づけを防ぐ）。
-- =========================================================================

-- @schema public.lesson_t_sprint
CREATE TABLE public.lesson_t_sprint (
    lesson_sprint_id         uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    student_id               uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    sprint_type              text         NOT NULL,
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE RESTRICT,
    question_type            text         NOT NULL,
    answer_type              text         NOT NULL,
    difficulty_level         smallint     NOT NULL,
    time_limit_sec           smallint     NOT NULL,
    total_answered           smallint     NOT NULL,
    total_evaluated          smallint     NOT NULL,
    paused_duration_sec      smallint     NOT NULL DEFAULT 0,
    session_note             text,
    answered_history         jsonb        NOT NULL DEFAULT '[]'::jsonb,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    session_id               uuid         REFERENCES public.com_t_session(session_id) ON DELETE SET NULL,
    CONSTRAINT chk_lesson_sprint_types CHECK ((sprint_type = ANY (ARRAY['0'::text, '1'::text])) AND (question_type = ANY (ARRAY['0'::text, '4'::text, '5'::text, '6'::text])) AND (answer_type = ANY (ARRAY['0'::text, '1'::text]))),
    CONSTRAINT lesson_t_sprint_answered_history_is_array CHECK (jsonb_typeof(answered_history) = 'array'::text)
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
COMMENT ON COLUMN public.lesson_t_sprint.session_id IS '実施したライブセッション (com_t_session)。NULL許容（単独実施・外部Zoom実施等はNULL）';

CREATE INDEX idx_lesson_t_sprint_coach_student ON public.lesson_t_sprint (coach_id, student_id, insert_date DESC);
CREATE INDEX idx_lesson_t_sprint_content_id ON public.lesson_t_sprint (content_id);
CREATE INDEX idx_lesson_t_sprint_session ON public.lesson_t_sprint (session_id, insert_date);
CREATE INDEX idx_lesson_t_sprint_student ON public.lesson_t_sprint (student_id, insert_date DESC);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.lesson_t_sprint FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.lesson_t_sprint ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage lesson sprints they ran" ON public.lesson_t_sprint FOR ALL TO authenticated
USING (
    coach_id = auth.uid() OR public.is_system_admin()
)
WITH CHECK (
    coach_id = auth.uid() AND (session_id IS NULL OR (EXISTS ( SELECT 1
       FROM public.com_t_session s
      WHERE s.session_id = lesson_t_sprint.session_id AND s.coach_id = auth.uid() AND s.student_id = lesson_t_sprint.student_id)))
);

CREATE POLICY "Students can view their own lesson sprints" ON public.lesson_t_sprint FOR SELECT TO authenticated
USING (
    student_id = auth.uid()
);
-- @end-schema
