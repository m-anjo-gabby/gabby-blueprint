---------------------------------------------
-- DDL: com_t_favorite_phrase (お気に入りフレーズ)
---------------------------------------------
CREATE TABLE public.com_t_favorite_phrase (
  favorite_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  phrase_id uuid NOT NULL REFERENCES public.com_m_phrase(phrase_id) ON DELETE CASCADE,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, phrase_id)
);

COMMENT ON TABLE public.com_t_favorite_phrase IS 'お気に入りフレーズ';
COMMENT ON COLUMN public.com_t_favorite_phrase.favorite_id IS 'お気に入りID';
COMMENT ON COLUMN public.com_t_favorite_phrase.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_favorite_phrase.phrase_id IS 'フレーズID';
COMMENT ON COLUMN public.com_t_favorite_phrase.insert_date IS '登録日時';

-- 旧索引 idx_com_t_favorite_phrase_user_phrase (user_id, phrase_id) は UNIQUE 制約の索引と同じ内容のため廃止（2026-09-30）
DROP INDEX IF EXISTS public.idx_com_t_favorite_phrase_user_phrase;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_favorite_phrase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own favorites" ON public.com_t_favorite_phrase;
-- 旧ポリシー「Managers can view client's favorites」は、閲覧者のロールを見ずに同じ顧客（client_id）の
-- 全ユーザーへSELECTを許していた（同じ法人の他の生徒からも読めた）ため廃止（2026-09-30）。
-- 管理画面からの参照が必要になった場合は、service_role（RLS対象外）のサーバー処理で取得する。
DROP POLICY IF EXISTS "Managers can view client's favorites" ON public.com_t_favorite_phrase;

CREATE POLICY "Users can manage their own favorites" ON public.com_t_favorite_phrase
FOR ALL TO authenticated
-- auth.uid() を SELECT で包み、行ごとではなくクエリで1回だけ評価させる（Supabase推奨）
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

---------------------------------------------
-- 索引（ユーザーごとの取得は UNIQUE(user_id, phrase_id) の索引を使う）
-- 対象側の列の索引: 教材・フレーズ・問題の削除時の ON DELETE CASCADE で、お気に入り全体を走査しないようにする
---------------------------------------------
CREATE INDEX IF NOT EXISTS idx_com_t_favorite_phrase_phrase_id
ON public.com_t_favorite_phrase (phrase_id);

---------------------------------------------
-- 登録上限（ユーザーごと1000件。DDL/function/fn_check_favorite_limit.sql）
---------------------------------------------
DROP TRIGGER IF EXISTS trg_com_t_favorite_phrase_limit ON public.com_t_favorite_phrase;
CREATE TRIGGER trg_com_t_favorite_phrase_limit
BEFORE INSERT ON public.com_t_favorite_phrase
FOR EACH ROW EXECUTE FUNCTION public.fn_check_favorite_limit('phrase_id');
