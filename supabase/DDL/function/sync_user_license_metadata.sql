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
