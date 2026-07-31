---------------------------------------------
-- DDL: com_m_user (ユーザ情報マスタ)
---------------------------------------------
CREATE TABLE public.com_m_user (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY, 
  user_id BIGSERIAL UNIQUE NOT NULL, 
  client_id uuid REFERENCES public.com_m_client(client_id),
  user_type text DEFAULT '1', -- デフォルトを '1' (生徒) 
  user_name text DEFAULT NULL,
  locale_id text DEFAULT 'ja',
  timezone text NOT NULL DEFAULT 'Asia/Tokyo',
  login_failed_count integer not null default 0,
  locked_until timestamp with time zone null,
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

COMMENT ON TABLE public.com_m_user IS 'ユーザ情報マスタ';
COMMENT ON COLUMN public.com_m_user.id IS '認証システムID (UUID)';
COMMENT ON COLUMN public.com_m_user.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_m_user.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_user.user_type IS 'ユーザタイプ 0：管理者 1:生徒 2:モニター';
COMMENT ON COLUMN public.com_m_user.user_name IS 'ユーザ名称';
COMMENT ON COLUMN public.com_m_user.locale_id IS 'ロケールID';
COMMENT ON COLUMN public.com_m_user.timezone IS 'IANAタイムゾーン名（例: Asia/Tokyo）';
COMMENT ON COLUMN public.com_m_user.login_failed_count IS 'ログイン連続失敗回数';
COMMENT ON COLUMN public.com_m_user.locked_until IS 'アカウントロックアウト終了日時';
COMMENT ON COLUMN public.com_m_user.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_user.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_user.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_user ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view themselves and colleagues" ON public.com_m_user;
DROP POLICY IF EXISTS "Users can view themselves and colleagues." ON public.com_m_user;
DROP POLICY IF EXISTS "Users can update their own data" ON public.com_m_user;
DROP POLICY IF EXISTS "Users can update their own data." ON public.com_m_user;

CREATE POLICY "Users can view themselves and colleagues" ON public.com_m_user
FOR SELECT TO authenticated USING (
    id = auth.uid() 
    OR 
    client_id = public.get_jwt_client_id()
);

CREATE POLICY "Users can update their own data" ON public.com_m_user
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

---------------------------------------------
-- 追加パッチ: プロフィールアイコン対応 (2026-07-31)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
-- 保存先: Storage "profile" バケット / パス例: profile/{user_id}/icon/{uuid}.png
---------------------------------------------
ALTER TABLE public.com_m_user
  ADD COLUMN IF NOT EXISTS icon_path text DEFAULT NULL;

COMMENT ON COLUMN public.com_m_user.icon_path IS 'プロフィールアイコン画像のStorageパス（profileバケット内、例: profile/{user_id}/icon/xxxx.png）';
