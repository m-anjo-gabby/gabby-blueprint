-- 呼び出し元がシステム管理者か（JWT の app_metadata の user_type が '0' で、roles に 'admin' を持つ）。
-- admin の利用者には教材担当（roles = ['content_manager']）もいるため、user_type だけで「管理者の権利」を判定しない。
-- 教材担当にも開く処理（チャットの査閲・教材・ツール）は、従来どおり get_jwt_user_type() = '0' で判定する。
-- roles は本人が書き換えられない app_metadata にあり、admin のアプリの判定（apps/admin/lib/adminAuth.ts の hasAdminRole）と同じ。
-- service_role・JWT の無い呼び出しは false を返す。
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    public.get_jwt_user_type() = '0'
      AND (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' -> 'roles') ? 'admin',
    false
  );
$$ LANGUAGE sql STABLE SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_system_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;
