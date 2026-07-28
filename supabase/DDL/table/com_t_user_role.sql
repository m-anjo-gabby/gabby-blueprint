---------------------------------------------
-- DDL: com_t_user_role (ユーザロール紐付け情報)
---------------------------------------------
CREATE TABLE public.com_t_user_role (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES public.com_m_role(role_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

COMMENT ON TABLE public.com_t_user_role IS 'ユーザロール紐付け情報';
COMMENT ON COLUMN public.com_t_user_role.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_user_role.role_id IS 'ロールID';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_user_role ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles or admins can view all" ON public.com_t_user_role;

CREATE POLICY "Users can view their own roles or admins can view all" ON public.com_t_user_role
FOR SELECT TO authenticated USING (
    auth.uid() = user_id 
    OR 
    (auth.jwt() -> 'app_metadata' ->> 'roles')::jsonb ? 'admin'
);
