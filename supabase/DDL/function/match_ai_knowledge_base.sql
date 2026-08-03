---------------------------------------------
-- ナレッジベース類似検索関数（RAG）
-- 依存: supabase/DDL/table/com_m_ai_knowledge_base.sql（vector拡張・テーブル定義）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_base(
    _query_embedding vector(768),
    _source_type TEXT DEFAULT NULL,
    _match_count INT DEFAULT 5,
    _match_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    knowledge_id uuid,
    source_type text,
    title text,
    body text,
    metadata jsonb,
    similarity float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT
        k.knowledge_id,
        k.source_type,
        k.title,
        k.body,
        k.metadata,
        1 - (k.embedding <=> _query_embedding) AS similarity
    FROM public.com_m_ai_knowledge_base k
    WHERE k.delete_flg = '0'
      AND k.embedding IS NOT NULL
      AND (_source_type IS NULL OR k.source_type = _source_type)
      AND 1 - (k.embedding <=> _query_embedding) >= _match_threshold
    ORDER BY k.embedding <=> _query_embedding ASC
    LIMIT _match_count;
$$;

-- 実運用ではService Roleクライアント（packages/lib/ai/retrieval）からの呼び出しを想定。
-- 将来クライアント（authenticated）から直接呼ぶケースに備え、明示的に権限を絞る。
ALTER FUNCTION public.match_ai_knowledge_base(vector, TEXT, INT, FLOAT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.match_ai_knowledge_base(vector, TEXT, INT, FLOAT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_base(vector, TEXT, INT, FLOAT) TO authenticated;
