---------------------------------------------
-- DDL: com_t_notice_read (お知らせ既読トランザクション)
---------------------------------------------
CREATE TABLE public.com_t_notice_read (
    notice_id UUID NOT NULL REFERENCES public.com_m_notice(notice_id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- auth.users(id) または アプリ内ユーザーID
    read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (notice_id, user_id)
);

COMMENT ON TABLE public.com_t_notice_read IS 'お知らせ既読管理トランザクション';
COMMENT ON COLUMN public.com_t_notice_read.notice_id IS 'お知らせID';
COMMENT ON COLUMN public.com_t_notice_read.user_id IS 'ユーザーID';
COMMENT ON COLUMN public.com_t_notice_read.read_at IS '既読日時';
COMMENT ON COLUMN public.com_t_notice_read.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_notice_read.update_date IS '更新日時';

-- パフォーマンス向上のためのインデックス設定（ユーザー指定でお知らせ一覧を取得する際）
CREATE INDEX idx_notice_read_user ON public.com_t_notice_read (user_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_notice_read ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own notice read status" ON public.com_t_notice_read;

CREATE POLICY "Users can manage their own notice read status" ON public.com_t_notice_read
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());