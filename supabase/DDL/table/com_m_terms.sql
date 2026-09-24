---------------------------------------------
-- DDL: com_m_terms (規約マスタ)
---------------------------------------------
CREATE TABLE public.com_m_terms (
  term_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_type text NOT NULL,        -- 'TERMS':利用規約, 'PRIVACY':プライバシーポリシー
  version_name text NOT NULL,     -- 'v1.0.0', '2026-05-07' 等
  storage_path text NOT NULL,     -- Supabase Storage内のパス ('terms/tos_v1.md'等)
  is_required boolean DEFAULT true NOT NULL, -- 同意が必須かどうか
  published_date timestamp with time zone DEFAULT now() NOT NULL, -- 公開日
  insert_date timestamp with time zone DEFAULT now() NOT NULL,
  update_date timestamp with time zone DEFAULT now() NOT NULL,
  
  UNIQUE(term_type, version_name)
);

COMMENT ON TABLE public.com_m_terms IS '規約マスタ：規約のバージョンとStorageパスを管理';
COMMENT ON COLUMN public.com_m_terms.term_type IS '規約タイプ（TERMS/PRIVACY等）';
COMMENT ON COLUMN public.com_m_terms.version_name IS '規約のバージョン名';
COMMENT ON COLUMN public.com_m_terms.storage_path IS 'Supabase Storage上のファイル参照パス';
COMMENT ON COLUMN public.com_m_terms.is_required IS '同意必須フラグ';
COMMENT ON COLUMN public.com_m_terms.published_date IS '公開日時';
COMMENT ON COLUMN public.com_m_terms.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_terms.update_date IS '更新日時';

CREATE INDEX idx_m_terms_type_published ON public.com_m_terms(term_type, published_date DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Terms are viewable by everyone" ON public.com_m_terms;
DROP POLICY IF EXISTS "Admins can manage terms" ON public.com_m_terms;

CREATE POLICY "Terms are viewable by everyone" ON public.com_m_terms 
FOR SELECT USING (term_type IS NOT NULL);

CREATE POLICY "Admins can manage terms" ON public.com_m_terms
FOR ALL TO authenticated 
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

---------------------------------------------
-- 追加パッチ: 規約本文のDB管理化（リビジョン管理） (2026-09-24 追加)
---------------------------------------------
-- 【背景】
-- 規約本文はStorage（termsバケット）ではなく com_m_terms_revision.content で管理する
-- 方針に変更した（詳細は table/com_m_terms_revision.sql を参照）。
-- storage_pathは移行完了までの互換用に残すが、新規作成時は設定しないためNOT NULLを外す。
-- 移行確認後の次リリースで列ごと削除する予定。
---------------------------------------------
ALTER TABLE public.com_m_terms
  ALTER COLUMN storage_path DROP NOT NULL;

COMMENT ON TABLE public.com_m_terms IS '規約マスタ：規約のバージョン（同意の単位）を管理。本文は com_m_terms_revision で管理';
COMMENT ON COLUMN public.com_m_terms.storage_path IS '【非推奨・削除予定】旧Supabase Storage上の本文ファイルパス。本文は com_m_terms_revision を参照すること';
