---------------------------------------------
-- fn_find_auth_user_id_by_email: メールアドレスで認証のアカウント（auth.users）を探す
---------------------------------------------
-- admin のユーザーの招待・即時作成（apps/admin/actions/adminUserAction.ts）が、登録済みのアドレスかを確かめるのに使う。
-- com_m_user にはメールアドレスの列が無く、削除済み（delete_flg = '1'）のユーザーも認証のアカウントは残るため、
-- auth.users を直接見る（大文字小文字を区別しない）。見つからなければ NULL。service_role 専用。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_find_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT au.id FROM auth.users au WHERE lower(au.email) = lower(trim(p_email)) LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_find_auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_find_auth_user_id_by_email(text) TO service_role;
