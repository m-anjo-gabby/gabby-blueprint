---------------------------------------------
-- DDL: com_m_role (ロールマスタ)
---------------------------------------------
CREATE TABLE public.com_m_role (
  role_id TEXT PRIMARY KEY, -- 'admin', 'content_manager'
  role_name TEXT NOT NULL,
  target_user_type TEXT DEFAULT '0',
  seq_no SMALLINT NOT NULL DEFAULT 1,
  delete_flg TEXT NOT NULL DEFAULT '0'
);

COMMENT ON TABLE public.com_m_role IS 'ロールマスタ';
COMMENT ON COLUMN public.com_m_role.role_id IS 'ロールID';
COMMENT ON COLUMN public.com_m_role.role_name IS 'ロール名';
COMMENT ON COLUMN public.com_m_role.target_user_type IS '対象ユーザー種別 (0:管理者, 1:生徒';
COMMENT ON COLUMN public.com_m_role.seq_no IS 'SEQ';
COMMENT ON COLUMN public.com_m_role.delete_flg IS '削除フラグ';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_role ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view roles" ON public.com_m_role;

CREATE POLICY "Anyone can view roles" ON public.com_m_role
FOR SELECT TO authenticated USING (delete_flg = '0');
