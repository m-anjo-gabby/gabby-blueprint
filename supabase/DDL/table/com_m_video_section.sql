-- =========================================================================
-- com_m_video_section: ビデオ教材（シリーズ）の中の区切り
-- 前提: com_m_contents
-- =========================================================================
-- 【役割】
-- ビデオ教材（com_m_contents.content_type = 1。1シリーズ = 1教材）のビデオを、見出しごとにまとめる。
-- ビデオは必ず区切りの中に置く。教材の作成時（admin の upsertContent）に見出しの無い区切り（section_name が NULL）を
-- 1つ作り、見出しの要らない教材はその区切りだけを使う。
--
-- 【書き込み】
-- admin（service_role）だけ。ビデオの残っている区切りは admin で削除させない（ビデオを移すか消してから）。
-- 教材を削除すると区切り・ビデオも消えるが、視聴の記録（student_m_video_progress）のあるビデオは
-- RESTRICT で止まる。
--
-- 【参照できる範囲】
-- 親の教材が見える利用者（com_m_contents の RLS をそのまま使う）。
-- =========================================================================

-- @schema public.com_m_video_section
CREATE TABLE public.com_m_video_section (
    section_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
    section_name             text,
    seq_no                   smallint     NOT NULL DEFAULT 1,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_m_video_section IS 'ビデオ教材の区切りマスタ';
COMMENT ON COLUMN public.com_m_video_section.section_id IS '区切りID';
COMMENT ON COLUMN public.com_m_video_section.content_id IS 'コンテンツID（content_type=1:ビデオの教材）';
COMMENT ON COLUMN public.com_m_video_section.section_name IS '区切りの見出し（NULL:見出しを出さない）';
COMMENT ON COLUMN public.com_m_video_section.seq_no IS '教材の中の並び順';
COMMENT ON COLUMN public.com_m_video_section.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_video_section.update_date IS '更新日時';

CREATE INDEX idx_video_section_content_seq ON public.com_m_video_section (content_id, seq_no);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_video_section FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_video_section ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sections of accessible video contents" ON public.com_m_video_section FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_m_contents c
      WHERE c.content_id = com_m_video_section.content_id))
);
-- @end-schema
