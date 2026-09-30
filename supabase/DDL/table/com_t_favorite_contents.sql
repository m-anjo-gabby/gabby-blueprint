---------------------------------------------
-- DDL: com_t_favorite_contents (お気に入りコンテンツ)
---------------------------------------------
CREATE TABLE public.com_t_favorite_contents (
  favorite_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, content_id)
);

COMMENT ON TABLE public.com_t_favorite_contents IS 'お気に入りコンテンツ';
COMMENT ON COLUMN public.com_t_favorite_contents.favorite_id IS 'お気に入りID';
COMMENT ON COLUMN public.com_t_favorite_contents.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_favorite_contents.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_t_favorite_contents.insert_date IS '登録日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_favorite_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own favorite contents" ON public.com_t_favorite_contents;

CREATE POLICY "Users can manage their own favorite contents" ON public.com_t_favorite_contents
FOR ALL TO authenticated 
-- auth.uid() を SELECT で包み、行ごとではなくクエリで1回だけ評価させる（Supabase推奨）
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

---------------------------------------------
-- 索引（ユーザーごとの取得は UNIQUE(user_id, content_id) の索引を使う）
-- 対象側の列の索引: 教材・フレーズ・問題の削除時の ON DELETE CASCADE で、お気に入り全体を走査しないようにする
---------------------------------------------
CREATE INDEX IF NOT EXISTS idx_com_t_favorite_contents_content_id
ON public.com_t_favorite_contents (content_id);

---------------------------------------------
-- 登録上限（ユーザーごと1000件。DDL/function/fn_check_favorite_limit.sql）
---------------------------------------------
DROP TRIGGER IF EXISTS trg_com_t_favorite_contents_limit ON public.com_t_favorite_contents;
CREATE TRIGGER trg_com_t_favorite_contents_limit
BEFORE INSERT ON public.com_t_favorite_contents
FOR EACH ROW EXECUTE FUNCTION public.fn_check_favorite_limit('content_id');
