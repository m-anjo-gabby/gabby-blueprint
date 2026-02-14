---------------------------------------------
-- SQLポリシー 顧客アクセス
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can view their own client information" ON public.com_m_client;

-- 1. RLSの有効化
ALTER TABLE public.com_m_client ENABLE ROW LEVEL SECURITY;

-- 2. 参照ポリシー：自分の所属するclient_idのみ閲覧可能
CREATE POLICY "Users can view their own client information" ON public.com_m_client
FOR SELECT TO authenticated USING (
  client_id = public.get_jwt_client_id()
);

---------------------------------------------
-- SQLポリシー ユーザマスタ
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can view themselves and colleagues." ON public.com_m_user;
DROP POLICY IF EXISTS "Users can update their own data." ON public.com_m_user;

-- 参照：自分自身、または「同じテナント」のメンバーなら閲覧可能
CREATE POLICY "Users can view themselves and colleagues" ON public.com_m_user
FOR SELECT TO authenticated USING (
  id = auth.uid() 
  OR 
  client_id = public.get_jwt_client_id()
);

-- 更新：自分自身のプロフィールのみ変更可能
CREATE POLICY "Users can update their own data" ON public.com_m_user
FOR UPDATE TO authenticated USING (
  id = auth.uid()
) WITH CHECK (
  id = auth.uid()
);

---------------------------------------------
-- SQLポリシー コーパスアクセス
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can view common or assigned corpora" ON public.com_m_corpus;
DROP POLICY IF EXISTS "Users can view their own client corpus access" ON public.com_m_corpus_access;

-- 1. テーブルのRLSを有効化
ALTER TABLE public.com_m_corpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_m_corpus_access ENABLE ROW LEVEL SECURITY;

-- 2. 参照（SELECT）ポリシーの作成
CREATE POLICY "Users can view common or assigned corpora" ON public.com_m_corpus
FOR SELECT TO authenticated USING (
  corpus_type = 0
  OR EXISTS (
    SELECT 1 FROM public.com_m_corpus_access a
    WHERE a.corpus_id = public.com_m_corpus.corpus_id
    AND a.client_id = public.get_jwt_client_id()
    AND a.delete_flg = '0'
  )
);

-- 3. 自分の所属する client_id に紐づくアクセス権設定だけが見える
CREATE POLICY "Users can view their own client corpus access" ON public.com_m_corpus_access
FOR SELECT USING (
  client_id = public.get_jwt_client_id()
);

---------------------------------------------
-- SQLポリシー 単語、フレーズ
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can view words of accessible corpora" ON public.com_m_word;
DROP POLICY IF EXISTS "Users can view phrases of accessible words" ON public.com_m_phrase;

-- 単語マスタのRLS
ALTER TABLE public.com_m_word ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view words of accessible corpora" ON public.com_m_word
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.com_m_corpus c
    WHERE c.corpus_id = public.com_m_word.corpus_id
    -- ここで「コーパス自体のRLSポリシー」が再帰的に評価されるため、非常に安全
  )
);

-- フレーズマスタのRLS
ALTER TABLE public.com_m_phrase ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view phrases of accessible words" ON public.com_m_phrase
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.com_m_word w
    WHERE w.word_id = public.com_m_phrase.word_id
  )
);

---------------------------------------------
-- SQLポリシー お気に入りフレーズ
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can manage their own favorites" ON public.com_t_favorite_phrase;
DROP POLICY IF EXISTS "Managers can view client's favorites" ON public.com_t_favorite_phrase;

-- RLS設定
ALTER TABLE public.com_t_favorite_phrase ENABLE ROW LEVEL SECURITY;

-- 利用者向けの参照ポリシー
CREATE POLICY "Users can manage their own favorites" ON public.com_t_favorite_phrase
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 管理者向けの参照ポリシー（オプション）
CREATE POLICY "Managers can view client's favorites" ON public.com_t_favorite_phrase
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.com_m_user u
    WHERE u.id = public.com_t_favorite_phrase.user_id
    AND u.client_id = public.get_jwt_client_id()
  )
);

---------------------------------------------
-- SQLポリシー お気に入りコーパス
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can manage their own favorite corpus" ON public.com_t_favorite_corpus;

-- RLS設定
ALTER TABLE public.com_t_favorite_corpus ENABLE ROW LEVEL SECURITY;

-- 利用者向けの参照ポリシー
CREATE POLICY "Users can manage their own favorite corpus" ON public.com_t_favorite_corpus
FOR ALL TO authenticated USING (
  user_id = auth.uid()
);

---------------------------------------------
-- SQLポリシー コーパスタグ管理
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Anyone can view tags" ON public.com_m_corpus_tag;

-- RLS設定
ALTER TABLE public.com_m_corpus_tag ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは誰でも参照可能
CREATE POLICY "Anyone can view tags" ON public.com_m_corpus_tag
FOR SELECT TO authenticated USING (delete_flg = '0');

-- 管理（更新・追加）は authenticated には許可しない（デフォルトで制限）