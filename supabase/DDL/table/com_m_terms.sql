-- =========================================================================
-- com_m_terms: 規約（バージョン）
-- =========================================================================
-- 同意の単位。本文は com_m_terms_revision が持つ（バージョンとリビジョンの分担はそちらを参照）。
-- storage_path は旧方式（Storage の terms バケットの本文ファイル）の名残で、新しく作る規約では入れない。
-- 移行を確認した後に列ごと削除する予定。
-- =========================================================================

-- @schema public.com_m_terms
CREATE TABLE public.com_m_terms (
    term_id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    term_type                text         NOT NULL,
    version_name             text         NOT NULL,
    storage_path             text,
    is_required              boolean      NOT NULL DEFAULT true,
    published_date           timestamp with time zone NOT NULL DEFAULT now(),
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_m_terms_term_type_version_name_key UNIQUE (term_type, version_name)
);

COMMENT ON TABLE public.com_m_terms IS '規約マスタ：規約のバージョン（同意の単位）を管理。本文は com_m_terms_revision で管理';
COMMENT ON COLUMN public.com_m_terms.term_type IS '規約タイプ（TERMS/PRIVACY等）';
COMMENT ON COLUMN public.com_m_terms.version_name IS '規約のバージョン名';
COMMENT ON COLUMN public.com_m_terms.storage_path IS '【非推奨・削除予定】旧Supabase Storage上の本文ファイルパス。本文は com_m_terms_revision を参照すること';
COMMENT ON COLUMN public.com_m_terms.is_required IS '同意必須フラグ';
COMMENT ON COLUMN public.com_m_terms.published_date IS '公開日時';
COMMENT ON COLUMN public.com_m_terms.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_terms.update_date IS '更新日時';

CREATE INDEX idx_m_terms_type_published ON public.com_m_terms (term_type, published_date DESC);

ALTER TABLE public.com_m_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage terms" ON public.com_m_terms FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Terms are viewable by everyone" ON public.com_m_terms FOR SELECT TO public
USING (
    term_type IS NOT NULL
);
-- @end-schema
