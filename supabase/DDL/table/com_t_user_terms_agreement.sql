-- =========================================================================
-- com_t_user_terms_agreement: 規約への同意の履歴
-- =========================================================================
-- revision_id は同意した時点で表示していた本文のリビジョン（com_m_terms_revision）。
-- リビジョンの管理を始める前の同意は NULL で、どのリビジョンに同意したかは agreed_date と
-- com_m_terms_revision.insert_date を比べて推定する。
-- =========================================================================

-- @schema public.com_t_user_terms_agreement
CREATE TABLE public.com_t_user_terms_agreement (
    agreement_id             uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    term_id                  uuid         NOT NULL REFERENCES public.com_m_terms(term_id),
    agreed_date              timestamp with time zone NOT NULL DEFAULT now(),
    ip_address               text,
    user_agent               text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    revision_id              uuid         REFERENCES public.com_m_terms_revision(revision_id),
    CONSTRAINT com_t_user_terms_agreement_user_id_term_id_key UNIQUE (user_id, term_id)
);

COMMENT ON TABLE public.com_t_user_terms_agreement IS '規約同意履歴：ユーザーが同意した規約の記録';
COMMENT ON COLUMN public.com_t_user_terms_agreement.user_id IS 'ユーザID (auth.users連携)';
COMMENT ON COLUMN public.com_t_user_terms_agreement.term_id IS '規約マスタID';
COMMENT ON COLUMN public.com_t_user_terms_agreement.agreed_date IS '同意日付';
COMMENT ON COLUMN public.com_t_user_terms_agreement.ip_address IS '同意時の接続元IP';
COMMENT ON COLUMN public.com_t_user_terms_agreement.user_agent IS '同意時のブラウザ情報';
COMMENT ON COLUMN public.com_t_user_terms_agreement.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_terms_agreement.update_date IS '更新日時';
COMMENT ON COLUMN public.com_t_user_terms_agreement.revision_id IS '同意時点で表示していた規約リビジョンID（導入前の同意はNULL）';

CREATE INDEX idx_user_agreement_revision_id ON public.com_t_user_terms_agreement (revision_id);
CREATE INDEX idx_user_agreement_term_id ON public.com_t_user_terms_agreement (term_id);
CREATE INDEX idx_user_agreement_user_id ON public.com_t_user_terms_agreement (user_id);

ALTER TABLE public.com_t_user_terms_agreement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users and Admins can insert agreement history" ON public.com_t_user_terms_agreement FOR INSERT TO authenticated
WITH CHECK (
    user_id = auth.uid() OR public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Users and Admins can view agreement history" ON public.com_t_user_terms_agreement FOR SELECT TO authenticated
USING (
    user_id = auth.uid() OR public.get_jwt_user_type() = '0'::text
);
-- @end-schema
