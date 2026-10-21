-- =========================================================================
-- student_t_training_menu_item: 今日のトレーニングメニューのやること
-- 前提: student_t_training_menu, com_m_contents, com_m_video
-- =========================================================================
-- 【役割】
-- メニューの中のやること1件で1行。seq_no の順に表示する。
-- - item_type 1: スプリントのタイムアタック。教材・問題種別・レベルと回数（target_count）を持つ。
--   その日（生徒のタイムゾーン）の self_t_sprint の、同じ教材・種別・レベルの件数が回数に届いたら完了。
-- - item_type 2: ビデオ。student_m_video_progress.completed_at があれば完了。
--
-- 【書き込み】
-- 作成は create_training_menu だけ。生徒本人は completed_at だけを書ける（列単位の UPDATE の権限）。
--
-- 【削除】
-- メニューからは CASCADE。メニューは学習の記録ではなく案内のため、教材・ビデオからも CASCADE
-- （運営がビデオを並べ替え・削除する時に止めない。実績は各トレーニングの記録に残る）。
-- =========================================================================

-- @schema public.student_t_training_menu_item
CREATE TABLE public.student_t_training_menu_item (
    item_id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    menu_id                  uuid         NOT NULL REFERENCES public.student_t_training_menu(menu_id) ON DELETE CASCADE,
    seq_no                   smallint     NOT NULL,
    item_type                smallint     NOT NULL,
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
    video_id                 uuid         REFERENCES public.com_m_video(video_id) ON DELETE CASCADE,
    question_type            text,
    difficulty_level         smallint,
    target_count             smallint     NOT NULL DEFAULT 1,
    completed_at             timestamp with time zone,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_training_menu_item_seq UNIQUE (menu_id, seq_no),
    CONSTRAINT chk_training_menu_item_item_type CHECK (item_type = ANY (ARRAY[1, 2])),
    CONSTRAINT chk_training_menu_item_question_type CHECK (question_type = ANY (ARRAY['0'::text, '4'::text, '5'::text, '6'::text])),
    CONSTRAINT chk_training_menu_item_target CHECK (item_type = 1 AND question_type IS NOT NULL AND difficulty_level IS NOT NULL AND video_id IS NULL AND target_count >= 1 OR item_type = 2 AND video_id IS NOT NULL AND question_type IS NULL AND difficulty_level IS NULL AND target_count = 1)
);

COMMENT ON TABLE public.student_t_training_menu_item IS '今日のトレーニングメニューのやること';
COMMENT ON COLUMN public.student_t_training_menu_item.item_id IS 'やることID';
COMMENT ON COLUMN public.student_t_training_menu_item.menu_id IS 'メニューID';
COMMENT ON COLUMN public.student_t_training_menu_item.seq_no IS 'メニューの中の並び順';
COMMENT ON COLUMN public.student_t_training_menu_item.item_type IS 'やることの種類（1:スプリントのタイムアタック, 2:ビデオ）';
COMMENT ON COLUMN public.student_t_training_menu_item.content_id IS 'コンテンツID（スプリント・ビデオの教材）';
COMMENT ON COLUMN public.student_t_training_menu_item.video_id IS 'ビデオID（item_type=2 のみ）';
COMMENT ON COLUMN public.student_t_training_menu_item.question_type IS 'スプリント問題種別（item_type=1 のみ。''0'': Speed, ''4'': Structure, ''5'': Builders, ''6'': Mastery）';
COMMENT ON COLUMN public.student_t_training_menu_item.difficulty_level IS 'スプリントの難易度レベル（item_type=1 のみ）';
COMMENT ON COLUMN public.student_t_training_menu_item.target_count IS '行う回数（スプリントはタイムアタックの回数。ビデオは1）';
COMMENT ON COLUMN public.student_t_training_menu_item.completed_at IS '終えた日時（NULL:未完了）';
COMMENT ON COLUMN public.student_t_training_menu_item.insert_date IS '登録日時';
COMMENT ON COLUMN public.student_t_training_menu_item.update_date IS '更新日時';

CREATE INDEX idx_training_menu_item_content ON public.student_t_training_menu_item (content_id);
CREATE INDEX idx_training_menu_item_video ON public.student_t_training_menu_item (video_id);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.student_t_training_menu_item FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.student_t_training_menu_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can complete their own training menu items" ON public.student_t_training_menu_item FOR UPDATE TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.student_t_training_menu m
      WHERE m.menu_id = student_t_training_menu_item.menu_id AND m.user_id = auth.uid()))
)
WITH CHECK (
    (EXISTS ( SELECT 1
       FROM public.student_t_training_menu m
      WHERE m.menu_id = student_t_training_menu_item.menu_id AND m.user_id = auth.uid()))
);

CREATE POLICY "Users can view their own training menu items" ON public.student_t_training_menu_item FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.student_t_training_menu m
      WHERE m.menu_id = student_t_training_menu_item.menu_id AND m.user_id = auth.uid()))
);

REVOKE ALL ON public.student_t_training_menu_item FROM authenticated;
GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.student_t_training_menu_item TO authenticated;
GRANT UPDATE (completed_at) ON public.student_t_training_menu_item TO authenticated;
-- @end-schema
