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
-- SQLポリシー 契約マスタ
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can view their own client contracts" ON public.com_m_contract;

-- RLS設定
ALTER TABLE public.com_m_contract ENABLE ROW LEVEL SECURITY;

-- 参照：所属する顧客（企業）の契約情報のみ閲覧可能
CREATE POLICY "Users can view their own client contracts" ON public.com_m_contract
FOR SELECT TO authenticated USING (
    client_id = public.get_jwt_client_id()
);

---------------------------------------------
-- SQLポリシー ユーザーライセンス割当情報
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can view relevant licenses" ON public.com_t_user_license;

-- RLS設定
ALTER TABLE public.com_t_user_license ENABLE ROW LEVEL SECURITY;

-- 参照：自分のライセンス、または自社に所属するユーザーのライセンスを閲覧可能
-- ※生徒は「自分」のみ、法人の管理者は「自社全員」
CREATE POLICY "Users can view relevant licenses" ON public.com_t_user_license
FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR 
    contract_id IN (
        SELECT contract_id FROM public.com_m_contract 
        WHERE client_id = public.get_jwt_client_id()
    )
);

---------------------------------------------
-- SQLポリシー コンテンツアクセス
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can view common or assigned corpora" ON public.com_m_contents;
DROP POLICY IF EXISTS "Users can view their own client contents access" ON public.com_m_contents_access;

-- 1. テーブルのRLSを有効化
ALTER TABLE public.com_m_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.com_m_contents_access ENABLE ROW LEVEL SECURITY;

-- 2. 参照（SELECT）ポリシーの作成
CREATE POLICY "Users can view common or assigned corpora" ON public.com_m_contents
FOR SELECT TO authenticated USING (
  content_scope = 0
  OR EXISTS (
    SELECT 1 FROM public.com_m_contents_access a
    WHERE a.content_id = public.com_m_contents.content_id
    AND a.client_id = public.get_jwt_client_id()
    AND a.delete_flg = '0'
  )
);

-- 3. 自分の所属する client_id に紐づくアクセス権設定だけが見える
CREATE POLICY "Users can view their own client contents access" ON public.com_m_contents_access
FOR SELECT USING (
  client_id = public.get_jwt_client_id()
);

---------------------------------------------
-- SQLポリシー コンテンツタグ管理
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Anyone can view tags" ON public.com_m_contents_tag;

-- RLS設定
ALTER TABLE public.com_m_contents_tag ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは誰でも参照可能
CREATE POLICY "Anyone can view tags" ON public.com_m_contents_tag
FOR SELECT TO authenticated USING (delete_flg = '0');

-- 管理（更新・追加）は authenticated には許可しない（デフォルトで制限）

---------------------------------------------
-- SQLポリシー コンテンツタグリレーション管理
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Allow select for authenticated"  ON public.com_t_contents_tag_rel;

-- RLS設定
ALTER TABLE public.com_t_contents_tag_rel ENABLE ROW LEVEL SECURITY;

-- 参照ポリシー
CREATE POLICY "Allow select for authenticated" 
ON public.com_t_contents_tag_rel FOR SELECT TO authenticated USING (true);

---------------------------------------------
-- SQLポリシー コンテンツ再開管理
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can manage their own resume points" ON public.com_t_resume_contents;

-- RLS設定
ALTER TABLE public.com_t_resume_contents ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは誰でも参照・更新可能
CREATE POLICY "Users can manage their own resume points" ON public.com_t_resume_contents
FOR ALL TO authenticated USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid() -- 自分のデータとしてしか保存・更新できない
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
    SELECT 1 FROM public.com_m_contents c
    WHERE c.content_id = public.com_m_word.content_id
    -- ここで「コンテンツ自体のRLSポリシー」が再帰的に評価されるため、非常に安全
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
-- SQLポリシー お気に入りコンテンツ
---------------------------------------------
-- 既存のポリシーを削除してから再作成
DROP POLICY IF EXISTS "Users can manage their own favorite contents" ON public.com_t_favorite_contents;

-- RLS設定
ALTER TABLE public.com_t_favorite_contents ENABLE ROW LEVEL SECURITY;

-- 利用者向けの参照ポリシー
CREATE POLICY "Users can manage their own favorite contents" ON public.com_t_favorite_contents
FOR ALL TO authenticated USING (
  user_id = auth.uid()
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
-- SQLポリシー: com_t_tts_asset
---------------------------------------------
ALTER TABLE public.com_t_tts_asset ENABLE ROW LEVEL SECURITY;

-- 1. 全操作（SELECT, INSERT, UPDATE, DELETE）を認証済みユーザーに許可
-- ※アドミン画面からの利用を想定しているため、TO authenticated を指定
-- ※より厳格にするなら、auth.jwt() 内のロールやメールアドレスドメインで縛ることも可能
CREATE POLICY "Admin users can manage tts assets" ON public.com_t_tts_asset
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);