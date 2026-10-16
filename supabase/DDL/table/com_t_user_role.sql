-- =========================================================================
-- com_t_user_role: ユーザーとロールの紐づけ
-- =========================================================================

-- @schema public.com_t_user_role
CREATE TABLE public.com_t_user_role (
    user_id                  uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id                  text         NOT NULL REFERENCES public.com_m_role(role_id) ON DELETE CASCADE,
    CONSTRAINT com_t_user_role_pkey PRIMARY KEY (user_id, role_id)
);

COMMENT ON TABLE public.com_t_user_role IS 'ユーザロール紐付け情報';
COMMENT ON COLUMN public.com_t_user_role.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_user_role.role_id IS 'ロールID';

CREATE TRIGGER trg_sync_app_meta_roles AFTER INSERT OR DELETE OR UPDATE ON public.com_t_user_role FOR EACH ROW EXECUTE FUNCTION public.sync_user_app_metadata();

ALTER TABLE public.com_t_user_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles or admins can view all" ON public.com_t_user_role FOR SELECT TO authenticated
USING (
    auth.uid() = user_id OR (((auth.jwt() -> 'app_metadata'::text) ->> 'roles'::text)::jsonb) ? 'admin'::text
);
-- @end-schema
