---------------------------------------------
-- DDL: com_t_invitation (ユーザー招待管理)
---------------------------------------------
CREATE TABLE public.com_t_invitation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  user_name TEXT DEFAULT NULL,
  user_type TEXT NOT NULL DEFAULT '1', -- 0:管理者 1:生徒 2:モニター
  client_id UUID REFERENCES public.com_m_client(client_id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.com_m_contract(contract_id) ON DELETE SET NULL,
  roles TEXT[] DEFAULT '{}'::TEXT[],
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  mail_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  last_mail_error TEXT DEFAULT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_invitation IS 'ユーザー招待管理テーブル';
COMMENT ON COLUMN public.com_t_invitation.id IS '招待ID（仮ユーザーID）';
COMMENT ON COLUMN public.com_t_invitation.email IS '招待メールアドレス';
COMMENT ON COLUMN public.com_t_invitation.user_name IS '招待ユーザー名称';
COMMENT ON COLUMN public.com_t_invitation.user_type IS 'ユーザータイプ 0:管理者 1:生徒 2:モニター';
COMMENT ON COLUMN public.com_t_invitation.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_t_invitation.contract_id IS '紐付けるライセンス契約ID';
COMMENT ON COLUMN public.com_t_invitation.roles IS '付与するロールID配列';
COMMENT ON COLUMN public.com_t_invitation.token IS 'セキュアな招待用トークン';
COMMENT ON COLUMN public.com_t_invitation.expires_at IS '招待リンク有効期限日時';
COMMENT ON COLUMN public.com_t_invitation.accepted_at IS 'ユーザー本登録完了日時';
COMMENT ON COLUMN public.com_t_invitation.mail_sent_at IS '最終メール送信日時';
COMMENT ON COLUMN public.com_t_invitation.last_mail_error IS '最終メール送信時のエラー内容';
COMMENT ON COLUMN public.com_t_invitation.invited_by IS '招待を発行した管理者UUID';

CREATE INDEX idx_invitation_token ON public.com_t_invitation(token);
CREATE INDEX idx_invitation_email ON public.com_t_invitation(email);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_invitation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all invitations" ON public.com_t_invitation;
DROP POLICY IF EXISTS "Anon or Auth users can view valid invitations via token" ON public.com_t_invitation;
DROP POLICY IF EXISTS "System can update invitation on acceptance" ON public.com_t_invitation;

CREATE POLICY "Admins can manage all invitations" ON public.com_t_invitation
FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'
)
WITH CHECK (
    public.get_jwt_user_type() = '0'
);
