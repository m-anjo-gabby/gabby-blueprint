---------------------------------------------
-- DDL: com_t_resume_contents (コンテンツ再開管理テーブル)
---------------------------------------------
CREATE TABLE public.com_t_resume_contents (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  item_id uuid, 
  metadata JSONB NOT NULL DEFAULT '{}',
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_resume_contents IS 'コンテンツ再開管理テーブル';
COMMENT ON COLUMN public.com_t_resume_contents.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_resume_contents.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_t_resume_contents.item_id IS 'アイテムID（word_id, phrase_idなどの一意なID）';
COMMENT ON COLUMN public.com_t_resume_contents.metadata IS 'メタデータ';
COMMENT ON COLUMN public.com_t_resume_contents.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_resume_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own resume points" ON public.com_t_resume_contents;

CREATE POLICY "Users can manage their own resume points" ON public.com_t_resume_contents
FOR ALL TO authenticated 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
