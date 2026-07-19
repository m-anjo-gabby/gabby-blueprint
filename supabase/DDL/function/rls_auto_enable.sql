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
