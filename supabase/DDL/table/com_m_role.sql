-- =========================================================================
-- com_m_role: ロール（管理者の権限の種類）
-- =========================================================================

-- @schema public.com_m_role
CREATE TABLE public.com_m_role (
    role_id                  text         PRIMARY KEY,
    role_name                text         NOT NULL,
    target_user_type         text         DEFAULT '0'::text,
    seq_no                   smallint     NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.com_m_role IS 'ロールマスタ';
COMMENT ON COLUMN public.com_m_role.role_id IS 'ロールID';
COMMENT ON COLUMN public.com_m_role.role_name IS 'ロール名';
COMMENT ON COLUMN public.com_m_role.target_user_type IS '対象ユーザー種別 (0:管理者, 1:生徒';
COMMENT ON COLUMN public.com_m_role.seq_no IS 'SEQ';

ALTER TABLE public.com_m_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view roles" ON public.com_m_role FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
