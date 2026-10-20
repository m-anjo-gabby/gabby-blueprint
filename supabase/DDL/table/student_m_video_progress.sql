-- =========================================================================
-- student_m_video_progress: 生徒ごとのビデオの視聴の進み具合
-- 前提: com_m_user, com_m_video
-- =========================================================================
-- 【役割】
-- 1生徒 × 1ビデオで1行。続きからの再生位置（last_position_sec）と、最後まで見たか（completed_at）を持つ。
-- ホームの「続きから」は教材の再開位置（com_t_resume_contents の VideoResumeMetadata）で出し、この表は
-- ビデオごとの進み具合の表示に使う。日ごとの視聴の記録は持たない。
--
-- 【書き込み】
-- 生徒本人（サーバーアクションから本人の権限で）。WITH CHECK で、本人に見えるビデオの行だけを書かせる。
--
-- 【削除】
-- 学習の記録のため、ユーザーからは CASCADE、ビデオからは RESTRICT（docs/DATA-DELETION.md §3）。
-- 退会ではユーザーの行が残るため、この表も残る。
-- =========================================================================

-- @schema public.student_m_video_progress
CREATE TABLE public.student_m_video_progress (
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    video_id                 uuid         NOT NULL REFERENCES public.com_m_video(video_id) ON DELETE RESTRICT,
    last_position_sec        integer      NOT NULL DEFAULT 0,
    completed_at             timestamp with time zone,
    last_viewed_at           timestamp with time zone NOT NULL DEFAULT now(),
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT student_m_video_progress_pkey PRIMARY KEY (user_id, video_id),
    CONSTRAINT chk_video_progress_last_position_sec CHECK (last_position_sec >= 0)
);

COMMENT ON TABLE public.student_m_video_progress IS '生徒ビデオ視聴進捗';
COMMENT ON COLUMN public.student_m_video_progress.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.student_m_video_progress.video_id IS 'ビデオID';
COMMENT ON COLUMN public.student_m_video_progress.last_position_sec IS '最後に見ていた位置（秒）';
COMMENT ON COLUMN public.student_m_video_progress.completed_at IS '初めて最後まで見た日時（NULL:未視聴完了）';
COMMENT ON COLUMN public.student_m_video_progress.last_viewed_at IS '最後に見た日時';
COMMENT ON COLUMN public.student_m_video_progress.insert_date IS '登録日時';
COMMENT ON COLUMN public.student_m_video_progress.update_date IS '更新日時';

CREATE INDEX idx_video_progress_video ON public.student_m_video_progress (video_id);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.student_m_video_progress FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.student_m_video_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video progress" ON public.student_m_video_progress FOR ALL TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid() AND (EXISTS ( SELECT 1
       FROM public.com_m_video v
      WHERE v.video_id = student_m_video_progress.video_id))
);
-- @end-schema
