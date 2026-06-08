---------------------------------------------
-- サインアップ連動トリガー
---------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    -- userメタデータから値を取得
    param_client_id uuid := (new.raw_user_meta_data->>'client_id')::uuid;
    param_user_name text := new.raw_user_meta_data->>'user_name';
    param_user_type text := new.raw_user_meta_data->>'user_type';
    target_client_id uuid;
BEGIN
    -- 1. 優先順位に基づいた client_id の解決
    IF param_client_id IS NOT NULL THEN
        target_client_id := param_client_id;
    ELSE
        -- クライアントID未指定時は初期テナントを設定
        SELECT client_id INTO target_client_id FROM public.com_m_client WHERE client_type = 0 LIMIT 1;
    END IF;

    -- 2. ユーザマスタ登録
    INSERT INTO public.com_m_user (id, client_id, area_cd, user_type, user_name) 
    VALUES (
        new.id, 
        target_client_id, 
        '00', 
        COALESCE(param_user_type, '1'),
        param_user_name
    );

    -- 3. ユーザースプリント進捗マスタの初期レコード作成
    INSERT INTO public.student_m_sprint_progress (user_id)
    VALUES (new.id);

    RETURN new;
END;
-- SECURITY DEFINER 警告への対策: search_path の固定
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- トリガーの再登録用に一旦削除してクリーンに作成
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- API(RPC)経由での不正実行を完全に防御（トリガーからは問題なく起動します）
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


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
    IF (TG_OP = 'DELETE') THEN
        v_data := to_jsonb(OLD);
    ELSE
        v_data := to_jsonb(NEW);
    END IF;

    v_target_id := COALESCE(
        (v_data->>'id')::uuid, 
        (v_data->>'user_id')::uuid
    );

    IF (TG_OP = 'DELETE' AND TG_TABLE_NAME = 'com_m_user') THEN
        RETURN OLD;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_target_id) THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    SELECT user_type, client_id INTO v_user_type, v_client_id 
    FROM public.com_m_user WHERE id = v_target_id;

    SELECT array_agg(role_id) INTO v_roles 
    FROM public.com_t_user_role WHERE user_id = v_target_id;

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
-- SECURITY DEFINER 警告への対策: search_path の固定
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- トリガーのバインド
DROP TRIGGER IF EXISTS trg_sync_app_meta_m_user ON public.com_m_user;
CREATE TRIGGER trg_sync_app_meta_m_user
    AFTER INSERT OR UPDATE OF client_id, user_type ON public.com_m_user
    FOR EACH ROW EXECUTE PROCEDURE public.sync_user_app_metadata();

DROP TRIGGER IF EXISTS trg_sync_app_meta_roles ON public.com_t_user_role;
CREATE TRIGGER trg_sync_app_meta_roles
    AFTER INSERT OR UPDATE OR DELETE ON public.com_t_user_role
    FOR EACH ROW EXECUTE PROCEDURE public.sync_user_app_metadata();

-- API(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.sync_user_app_metadata() FROM PUBLIC, anon, authenticated;


---------------------------------------------
-- JWTから client_id を安全に取り出すヘルパー関数
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_jwt_client_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'client_id', '')::uuid;
-- 行レベルセキュリティ、ビューの参照をセキュアにするための設定
$$ LANGUAGE sql STABLE SET search_path = public;

-- 全体公開(PUBLIC)を剥奪した上で、認証済みロールにのみクリーンに許可
REVOKE EXECUTE ON FUNCTION public.get_jwt_client_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_jwt_client_id() TO authenticated;


---------------------------------------------
-- 有効ライセンス情報のメタデータ同期
---------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_license_metadata()
RETURNS TRIGGER AS $$
DECLARE
    is_licensed boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.com_t_user_license
        WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
          AND status = 1
          AND start_date <= NOW()
          AND end_date >= NOW()
    ) INTO is_licensed;

    UPDATE auth.users
    SET raw_app_meta_data = 
        COALESCE(raw_app_meta_data, '{}'::jsonb) || 
        jsonb_build_object('is_licensed', is_licensed)
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);

    RETURN NULL;
END;
-- SECURITY DEFINER 警告への対策: search_path の固定
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_license_change ON public.com_t_user_license;
CREATE TRIGGER on_license_change
AFTER INSERT OR UPDATE OR DELETE ON public.com_t_user_license
FOR EACH ROW EXECUTE PROCEDURE public.sync_user_license_metadata();

-- API(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.sync_user_license_metadata() FROM PUBLIC, anon, authenticated;


---------------------------------------------
-- JWTから user_type を安全に取り出すヘルパー関数
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_jwt_user_type()
RETURNS text AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'user_type', '');
$$ LANGUAGE sql STABLE SET search_path = public;

-- 全体公開(PUBLIC)を剥奪した上で、認証済みロールにのみクリーンに許可
REVOKE EXECUTE ON FUNCTION public.get_jwt_user_type() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_jwt_user_type() TO authenticated;


---------------------------------------------
-- 警告にあったrls_auto_enable の防御措置
---------------------------------------------
-- もしデータベース内に実体が存在する場合、外部からの RPC 実行を安全に遮断します。
-- (不要であれば DROP FUNCTION IF EXISTS public.rls_auto_enable(); で削除しても構いません)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable') THEN
        ALTER FUNCTION public.rls_auto_enable() SET search_path = public;
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;';
    END IF;
END $$;