---------------------------------------------
-- サインアップ連動トリガー
---------------------------------------------
-- ユーザー作成時に必須カラムを初期化してユーザマスタを作成する
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    -- userメタデータから値を取得
    param_client_id uuid := (new.raw_user_meta_data->>'client_id')::uuid;
    param_user_name text := new.raw_user_meta_data->>'user_name';
    param_user_type text := new.raw_user_meta_data->>'user_type';
    -- 処理対象クライアントID
    target_client_id uuid;
BEGIN
    -- 優先順位に基づいた client_id の解決
    IF param_client_id IS NOT NULL THEN
        target_client_id := param_client_id;
    ELSE
        -- クライアントID未指定時は初期テナントを設定
        SELECT client_id INTO target_client_id FROM public.com_m_client WHERE client_type = 0 LIMIT 1;
    END IF;

    -- ユーザマスタ登録
    INSERT INTO public.com_m_user (id, client_id, area_cd, user_type, user_name) 
    VALUES (
        new.id, 
        target_client_id, 
        '00', 
        COALESCE(param_user_type, '1'), -- デフォルト値の考慮
        param_user_name
    );

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーの登録
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

---------------------------------------------
-- 認証用スキーマのJWTの内容をカスタマイズ
---------------------------------------------
-- auth.users の metadata に client_id を自動でコピーするトリガーを作成します
CREATE OR REPLACE FUNCTION public.sync_user_metadata_client_id()
RETURNS TRIGGER AS $$
BEGIN
  -- auth.users の raw_app_meta_data に client_id を書き込む
  UPDATE auth.users
  SET raw_app_meta_data = 
    coalesce(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object('client_id', NEW.client_id)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- com_m_user が作成・更新されたらメタデータを同期
CREATE TRIGGER on_com_m_user_client_id_update
  AFTER INSERT OR UPDATE OF client_id ON public.com_m_user
  FOR EACH ROW EXECUTE PROCEDURE public.sync_user_metadata_client_id();

---------------------------------------------
-- JWTから client_id を安全に取り出すヘルパー関数
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_jwt_client_id()
RETURNS uuid AS $$
  -- app_metadata 内の client_id を UUID 型で取得
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'client_id', '')::uuid;
$$ LANGUAGE sql STABLE;

-- 権限付与（認証済みユーザーがこの関数を実行できるようにする）
GRANT EXECUTE ON FUNCTION public.get_jwt_client_id() TO authenticated;
