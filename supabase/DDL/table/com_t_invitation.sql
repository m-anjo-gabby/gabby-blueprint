-- =========================================================================
-- com_t_invitation: ユーザーの招待
-- =========================================================================

-- @schema public.com_t_invitation
CREATE TABLE public.com_t_invitation (
    id                       uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    email                    text         NOT NULL UNIQUE,
    user_name                text,
    user_type                text         NOT NULL DEFAULT '1'::text,
    client_id                uuid         REFERENCES public.com_m_client(client_id) ON DELETE SET NULL,
    contract_id              uuid         REFERENCES public.com_m_contract(contract_id) ON DELETE SET NULL,
    roles                    text[]       DEFAULT '{}'::text[],
    token                    text         NOT NULL UNIQUE,
    expires_at               timestamp with time zone NOT NULL,
    accepted_at              timestamp with time zone,
    mail_sent_at             timestamp with time zone,
    last_mail_error          text,
    invited_by               uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_invitation_user_type CHECK (user_type = ANY (ARRAY['0'::text, '1'::text, '2'::text]))
);

COMMENT ON TABLE public.com_t_invitation IS 'ユーザー招待管理テーブル';
COMMENT ON COLUMN public.com_t_invitation.id IS '招待ID（仮ユーザーID）';
COMMENT ON COLUMN public.com_t_invitation.email IS '招待メールアドレス';
COMMENT ON COLUMN public.com_t_invitation.user_name IS '招待ユーザー名称';
COMMENT ON COLUMN public.com_t_invitation.user_type IS 'ユーザー種別 0:管理者 1:生徒 2:コーチ';
COMMENT ON COLUMN public.com_t_invitation.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_t_invitation.contract_id IS '紐付けるライセンス契約ID';
COMMENT ON COLUMN public.com_t_invitation.roles IS '付与するロールID配列';
COMMENT ON COLUMN public.com_t_invitation.token IS 'セキュアな招待用トークン';
COMMENT ON COLUMN public.com_t_invitation.expires_at IS '招待リンク有効期限日時';
COMMENT ON COLUMN public.com_t_invitation.accepted_at IS 'ユーザー本登録完了日時';
COMMENT ON COLUMN public.com_t_invitation.mail_sent_at IS '最終メール送信日時';
COMMENT ON COLUMN public.com_t_invitation.last_mail_error IS '最終メール送信時のエラー内容';
COMMENT ON COLUMN public.com_t_invitation.invited_by IS '招待を発行した管理者UUID';

CREATE INDEX idx_invitation_client ON public.com_t_invitation (client_id);
CREATE INDEX idx_invitation_email ON public.com_t_invitation (email);
CREATE INDEX idx_invitation_token ON public.com_t_invitation (token);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_t_invitation FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_t_invitation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all invitations" ON public.com_t_invitation FOR ALL TO authenticated
USING (
    public.is_system_admin()
)
WITH CHECK (
    public.is_system_admin()
);
-- @end-schema
