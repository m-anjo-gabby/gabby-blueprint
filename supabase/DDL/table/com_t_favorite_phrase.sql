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

CREATE INDEX IF NOT EXISTS idx_com_t_favorite_phrase_user_phrase
ON public.com_t_favorite_phrase (user_id, phrase_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_favorite_phrase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own favorites" ON public.com_t_favorite_phrase;
DROP POLICY IF EXISTS "Managers can view client's favorites" ON public.com_t_favorite_phrase;

CREATE POLICY "Users can manage their own favorites" ON public.com_t_favorite_phrase
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Managers can view client's favorites" ON public.com_t_favorite_phrase
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_user u
        WHERE u.id = public.com_t_favorite_phrase.user_id
          AND u.client_id = public.get_jwt_client_id()
    )
);
