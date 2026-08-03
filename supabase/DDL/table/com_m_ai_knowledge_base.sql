---------------------------------------------
-- Extension: pgvector（RAG用ベクトル検索）
---------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

---------------------------------------------
-- DDL: com_m_ai_knowledge_base (AIナレッジベース / RAG用マスタ)
--
-- ヘルプ記事・AIコーチ知識・ロールプレイシナリオ等、
-- Gemini + pgvectorによるRAG検索対象を一元管理する共通テーブル。
-- 用途ごとにテーブルを分けず、source_typeで区分し、
-- 検索対象を増やすたびに埋め込み生成/検索ロジック（packages/lib/ai/embeddings, retrieval）を
-- 使い回せるようにする。
---------------------------------------------
CREATE TABLE public.com_m_ai_knowledge_base (
  knowledge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,             -- 'help' | 'coach' | 'roleplay' 等の区分（今後追加可）
  title TEXT NOT NULL,                   -- 記事・ナレッジのタイトル
  body TEXT NOT NULL,                    -- 埋め込み生成・回答根拠に使う本文
  metadata JSONB NOT NULL DEFAULT '{}',  -- source_typeごとに異なる付加情報（例: help→画面パス, roleplay→難易度/ペルソナ）
  embedding vector(768),                 -- Gemini Embedding（output_dimensionality=768）。未生成時はNULL
  embedding_model TEXT,                  -- 埋め込み生成に使用したモデルID（再生成判定用）
  delete_flg TEXT NOT NULL DEFAULT '0',
  created_by uuid,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_com_m_ai_knowledge_base_source_type
  ON public.com_m_ai_knowledge_base(source_type)
  WHERE delete_flg = '0';

-- ベクトル類似検索用（コサイン類似度）。embedding未生成の行はインデックス対象外で問題ない。
CREATE INDEX idx_com_m_ai_knowledge_base_embedding
  ON public.com_m_ai_knowledge_base
  USING hnsw (embedding vector_cosine_ops);

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

---------------------------------------------
-- 行レベルセキュリティ (RLS)
--
-- 検索(retrieval)はサーバー側（Service Role）から行う想定のためRLSの影響を受けない。
-- 誤ってanon/authenticatedキーで参照・更新された場合の安全網として、
-- admin(user_type='0')のみ操作可能に限定する。
---------------------------------------------
ALTER TABLE public.com_m_ai_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin users can manage ai knowledge base" ON public.com_m_ai_knowledge_base;

CREATE POLICY "Admin users can manage ai knowledge base" ON public.com_m_ai_knowledge_base
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');
