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
-- app_metadata 統合同期ファンクション
---------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_app_metadata()
RETURNS TRIGGER AS $$
DECLARE
    v_roles text[];
    v_user_type text;
    v_client_id uuid;
    v_target_id uuid;
    v_data jsonb;
BEGIN
    -- 1. 操作種別に応じてレコードを jsonb として取得
    IF (TG_OP = 'DELETE') THEN
        v_data := to_jsonb(OLD);
    ELSE
        v_data := to_jsonb(NEW);
    END IF;

    -- 2. jsonb から id または user_id を安全に取り出す
    v_target_id := COALESCE(
        (v_data->>'id')::uuid, 
        (v_data->>'user_id')::uuid
    );

    -- 3. ユーザー本体(com_m_user)の削除時は、auth.users も消えるため処理をスキップ
    IF (TG_OP = 'DELETE' AND TG_TABLE_NAME = 'com_m_user') THEN
        RETURN OLD;
    END IF;

    -- 4. auth.users が存在するかチェック
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_target_id) THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    -- 5. 最新情報をマスタから取得
    SELECT user_type, client_id INTO v_user_type, v_client_id 
    FROM public.com_m_user WHERE id = v_target_id;

    SELECT array_agg(role_id) INTO v_roles 
    FROM public.com_t_user_role WHERE user_id = v_target_id;

    -- 6. メタデータの更新実行
    UPDATE auth.users
    SET raw_app_meta_data = 
        COALESCE(raw_app_meta_data, '{}'::jsonb) || 
        jsonb_build_object(
            'client_id', v_client_id,
            'user_type', v_user_type,
            'roles', COALESCE(v_roles, '{}'::text[])
        )
    WHERE id = v_target_id;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーの登録
-- 1. com_m_user の変更時 (client_id, user_type)
DROP TRIGGER IF EXISTS trg_sync_app_meta_m_user ON public.com_m_user;
CREATE TRIGGER trg_sync_app_meta_m_user
    AFTER INSERT OR UPDATE OF client_id, user_type ON public.com_m_user
    FOR EACH ROW EXECUTE PROCEDURE public.sync_user_app_metadata();

-- 2. com_t_user_role の変更時 (roles)
DROP TRIGGER IF EXISTS trg_sync_app_meta_roles ON public.com_t_user_role;
CREATE TRIGGER trg_sync_app_meta_roles
    AFTER INSERT OR UPDATE OR DELETE ON public.com_t_user_role
    FOR EACH ROW EXECUTE PROCEDURE public.sync_user_app_metadata();

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

---------------------------------------------
-- 有効ライセンス情報のメタデータ同期
---------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_license_metadata()
RETURNS TRIGGER AS $$
DECLARE
    is_licensed boolean;
BEGIN
    -- 現在有効なライセンスが存在するかチェック
    SELECT EXISTS (
        SELECT 1 FROM public.com_t_user_license
        WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
          AND status = 1
          AND start_date <= NOW()
          AND end_date >= NOW()
    ) INTO is_licensed;

    -- auth.users の raw_app_meta_data を更新
    UPDATE auth.users
    SET raw_app_meta_data = 
        COALESCE(raw_app_meta_data, '{}'::jsonb) || 
        jsonb_build_object('is_licensed', is_licensed)
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_license_change
AFTER INSERT OR UPDATE OR DELETE ON public.com_t_user_license
FOR EACH ROW EXECUTE PROCEDURE public.sync_user_license_metadata();