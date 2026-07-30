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
