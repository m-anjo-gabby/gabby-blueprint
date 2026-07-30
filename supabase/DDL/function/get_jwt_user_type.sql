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
