-- =========================================================================
-- com_t_favorite_phrase: お気に入りのフレーズ
-- =========================================================================
-- お気に入りは種類ごとに別のテーブル（com_t_favorite_contents / com_t_favorite_phrase / com_t_favorite_sprint_question）で、
-- 同じ作りにそろえている。
--   - 本人の行だけを参照・登録・削除できる。ポリシーの auth.uid() は SELECT で包み、行ごとではなく1回だけ評価させる。
--     管理画面から参照が必要になった場合は service_role のサーバー処理で読む（同じ顧客の他のユーザーには見せない）。
--   - 対象の側の列に索引を張り、教材・フレーズ・問題の削除時の ON DELETE CASCADE でお気に入り全体を走査しないようにする。
--   - 登録の上限はユーザーごとに1000件（トリガー。function/fn_check_favorite_limit.sql）。
-- =========================================================================

-- @schema public.com_t_favorite_phrase
CREATE TABLE public.com_t_favorite_phrase (
    favorite_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    phrase_id                uuid         NOT NULL REFERENCES public.com_m_phrase(phrase_id) ON DELETE CASCADE,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_favorite_phrase_user_id_phrase_id_key UNIQUE (user_id, phrase_id)
);

COMMENT ON TABLE public.com_t_favorite_phrase IS 'お気に入りフレーズ';
COMMENT ON COLUMN public.com_t_favorite_phrase.favorite_id IS 'お気に入りID';
COMMENT ON COLUMN public.com_t_favorite_phrase.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_favorite_phrase.phrase_id IS 'フレーズID';
COMMENT ON COLUMN public.com_t_favorite_phrase.insert_date IS '登録日時';

CREATE INDEX idx_com_t_favorite_phrase_phrase_id ON public.com_t_favorite_phrase (phrase_id);

CREATE TRIGGER trg_com_t_favorite_phrase_limit BEFORE INSERT ON public.com_t_favorite_phrase FOR EACH ROW EXECUTE FUNCTION public.fn_check_favorite_limit('phrase_id');

ALTER TABLE public.com_t_favorite_phrase ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own favorites" ON public.com_t_favorite_phrase FOR ALL TO authenticated
USING (
    user_id = (( SELECT auth.uid() AS uid))
)
WITH CHECK (
    user_id = (( SELECT auth.uid() AS uid))
);
-- @end-schema
