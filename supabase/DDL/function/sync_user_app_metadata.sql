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
