-- =========================================================================
-- com_m_ai_knowledge_base: AI のナレッジベース（RAG の検索対象）
-- =========================================================================
-- 【役割】
-- ヘルプ記事・AI コーチの知識・ロールプレイのシナリオ等、pgvector で検索する対象をまとめて持つ。
-- 用途ごとにテーブルを分けず source_type で区分し、埋め込みの生成・検索の処理
-- （packages/lib/ai/embeddings, retrieval）を使い回す。embedding が未生成の行はベクトル索引の対象外でよい。
--
-- 【参照できる範囲】
-- 検索はサーバー側（service_role）で行う。誤って anon / authenticated で触られた場合の安全網として、
-- 管理者（user_type='0'）だけが操作できるようにしている。
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- @schema public.com_m_ai_knowledge_base
CREATE TABLE public.com_m_ai_knowledge_base (
    knowledge_id             uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    source_type              text         NOT NULL,
    title                    text         NOT NULL,
    body                     text         NOT NULL,
    metadata                 jsonb        NOT NULL DEFAULT '{}'::jsonb,
    embedding                public.vector(768),
    embedding_model          text,
    delete_flg               text         NOT NULL DEFAULT '0'::text,
    created_by               uuid,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_m_ai_knowledge_base IS 'AIナレッジベース（RAG検索対象マスタ。ヘルプ記事/AIコーチ知識/ロールプレイシナリオ等を共通管理）';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.knowledge_id IS 'ナレッジID';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.source_type IS '区分（help:ヘルプ記事, coach:AIコーチ知識, roleplay:ロールプレイシナリオ 等）';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.title IS 'タイトル';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.body IS '本文（埋め込み生成・回答根拠に使用）';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.metadata IS '付加情報（JSON。source_typeごとに異なる項目を許容）';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.embedding IS 'Geminiで生成したベクトル（次元768）';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.embedding_model IS '埋め込み生成に使用したモデルID';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.created_by IS '作成者ID';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_ai_knowledge_base.update_date IS '更新日時';

CREATE INDEX idx_com_m_ai_knowledge_base_embedding ON public.com_m_ai_knowledge_base USING hnsw (embedding public.vector_cosine_ops);
CREATE INDEX idx_com_m_ai_knowledge_base_source_type ON public.com_m_ai_knowledge_base (source_type) WHERE delete_flg = '0'::text;

ALTER TABLE public.com_m_ai_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage ai knowledge base" ON public.com_m_ai_knowledge_base FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    public.get_jwt_user_type() = '0'::text
);
-- @end-schema
