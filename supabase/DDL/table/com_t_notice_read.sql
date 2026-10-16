-- =========================================================================
-- com_t_notice_read: お知らせの既読
-- =========================================================================
-- cta_clicked_at は行動ボタンを最初に押した日時（ボタンの効果の確認に使う）。
-- =========================================================================

-- @schema public.com_t_notice_read
CREATE TABLE public.com_t_notice_read (
    notice_id                uuid         NOT NULL REFERENCES public.com_m_notice(notice_id) ON DELETE CASCADE,
    user_id                  uuid         NOT NULL,
    read_at                  timestamp with time zone NOT NULL DEFAULT now(),
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    cta_clicked_at           timestamp with time zone,
    CONSTRAINT com_t_notice_read_pkey PRIMARY KEY (notice_id, user_id)
);

COMMENT ON TABLE public.com_t_notice_read IS 'お知らせ既読管理トランザクション';
COMMENT ON COLUMN public.com_t_notice_read.notice_id IS 'お知らせID';
COMMENT ON COLUMN public.com_t_notice_read.user_id IS 'ユーザーID';
COMMENT ON COLUMN public.com_t_notice_read.read_at IS '既読日時';
COMMENT ON COLUMN public.com_t_notice_read.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_notice_read.update_date IS '更新日時';
COMMENT ON COLUMN public.com_t_notice_read.cta_clicked_at IS '行動ボタンを最初に押した日時';

CREATE INDEX idx_notice_read_user ON public.com_t_notice_read (user_id);

ALTER TABLE public.com_t_notice_read ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notice read status" ON public.com_t_notice_read FOR ALL TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);
-- @end-schema
