---------------------------------------------
-- DDL: com_m_user テーブルの作成
---------------------------------------------
CREATE TABLE public.com_m_user (
  -- 1. 主キーと認証の連携: 必須のUUID型
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY, 
  -- 2. システム採番ID (BIGSERIALで自動採番)
  user_id BIGSERIAL UNIQUE NOT NULL, 
  user_type text DEFAULT '1', -- デフォルトを '1' (生徒) 
  user_name text DEFAULT NULL,
  area_cd text NOT NULL DEFAULT '00',
  locale_id text DEFAULT 'ja',
  agree_date timestamp with time zone NULL, 
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

-- テーブル名にコメントを設定
COMMENT ON TABLE public.com_m_user IS 'ユーザ情報マスタ';

-- カラム名にコメントを設定
COMMENT ON COLUMN public.com_m_user.id IS '認証システムID (UUID)';
COMMENT ON COLUMN public.com_m_user.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_m_user.user_type IS 'ユーザタイプ 0：管理者 1:生徒 2:モニター';
COMMENT ON COLUMN public.com_m_user.user_name IS 'ユーザ名称';
COMMENT ON COLUMN public.com_m_user.area_cd IS '地域コード';
COMMENT ON COLUMN public.com_m_user.locale_id IS 'ロケールID';
COMMENT ON COLUMN public.com_m_user.agree_date IS '利用規約同意日付';
COMMENT ON COLUMN public.com_m_user.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_user.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_user.update_date IS '更新日時';

-- RLSの有効化
ALTER TABLE public.com_m_user ENABLE ROW LEVEL SECURITY;

-- ユーザー自身のみが自分のデータにアクセスできるポリシー
CREATE POLICY "Users can view and update their own com_m_user."
  ON public.com_m_user FOR ALL 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

---
-- サインアップ連動トリガー
---

-- ユーザー作成時に必須カラムを初期化してユーザマスタを作成する
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_user_id BIGINT;
BEGIN
    -- 1. 必須カラムの初期値を挿入（user_idは自動採番）
    INSERT INTO public.com_m_user (id, area_cd)
    VALUES (new.id, '00')
    RETURNING user_id INTO new_user_id; -- 採番されたuser_idを取得
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーの登録
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

