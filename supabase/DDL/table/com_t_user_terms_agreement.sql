---------------------------------------------
-- DDL: com_t_user_terms_agreement (規約同意履歴)
---------------------------------------------
CREATE TABLE public.com_t_user_terms_agreement (
  agreement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.com_m_user(id) ON DELETE CASCADE NOT NULL,
  term_id uuid REFERENCES public.com_m_terms(term_id) NOT NULL,
  agreed_date timestamp with time zone DEFAULT now() NOT NULL,
  ip_address text,                 -- 同意時のIPアドレス（証跡用）
  user_agent text,                 -- 同意時のブラウザ情報（証跡用）
  insert_date timestamp with time zone DEFAULT now() NOT NULL,
  update_date timestamp with time zone DEFAULT now() NOT NULL,

  UNIQUE(user_id, term_id)
);

COMMENT ON TABLE public.com_t_user_terms_agreement IS '規約同意履歴：ユーザーが同意した規約の記録';
COMMENT ON COLUMN public.com_t_user_terms_agreement.user_id IS 'ユーザID (auth.users連携)';
COMMENT ON COLUMN public.com_t_user_terms_agreement.term_id IS '規約マスタID';
COMMENT ON COLUMN public.com_t_user_terms_agreement.agreed_date IS '同意日付';
COMMENT ON COLUMN public.com_t_user_terms_agreement.ip_address IS '同意時の接続元IP';
COMMENT ON COLUMN public.com_t_user_terms_agreement.user_agent IS '同意時のブラウザ情報';
COMMENT ON COLUMN public.com_t_user_terms_agreement.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_terms_agreement.update_date IS '更新日時';

CREATE INDEX idx_user_agreement_user_id ON public.com_t_user_terms_agreement(user_id);
CREATE INDEX idx_user_agreement_term_id ON public.com_t_user_terms_agreement(term_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_user_terms_agreement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users and Admins can view agreement history" ON public.com_t_user_terms_agreement;
DROP POLICY IF EXISTS "Users and Admins can insert agreement history" ON public.com_t_user_terms_agreement;

CREATE POLICY "Users and Admins can view agreement history" ON public.com_t_user_terms_agreement
FOR SELECT TO authenticated USING (
    user_id = auth.uid() 
    OR 
    public.get_jwt_user_type() = '0'
);

CREATE POLICY "Users and Admins can insert agreement history" ON public.com_t_user_terms_agreement
FOR INSERT TO authenticated 
WITH CHECK (
    user_id = auth.uid() 
    OR 
    public.get_jwt_user_type() = '0'
);

---------------------------------------------
-- 追加パッチ: 同意時点のリビジョン記録 (2026-09-24 追加)
-- 前提: table/com_m_terms_revision.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 規約本文のリビジョン管理（サイレント更新）導入に伴い、同意した時点で表示していた
-- 文面を特定できるよう revision_id を記録する。
-- 導入前の既存同意レコードはNULL（どのリビジョンに同意したかは agreed_date と
-- com_m_terms_revision.insert_date の比較で推定する）。
---------------------------------------------
ALTER TABLE public.com_t_user_terms_agreement
  ADD COLUMN IF NOT EXISTS revision_id uuid REFERENCES public.com_m_terms_revision(revision_id);

COMMENT ON COLUMN public.com_t_user_terms_agreement.revision_id IS '同意時点で表示していた規約リビジョンID（導入前の同意はNULL）';

CREATE INDEX IF NOT EXISTS idx_user_agreement_revision_id ON public.com_t_user_terms_agreement(revision_id);
