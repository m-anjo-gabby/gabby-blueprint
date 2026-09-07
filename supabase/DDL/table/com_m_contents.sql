---------------------------------------------
-- DDL: com_m_contents (コンテンツ管理マスタ)
---------------------------------------------
CREATE TABLE public.com_m_contents (
  content_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_name TEXT NOT NULL,
  content_name_en TEXT,
  content_type SMALLINT NOT NULL DEFAULT 1,
  content_scope SMALLINT NOT NULL DEFAULT 0,
  seq_no SMALLINT NOT NULL DEFAULT 1,
  difficulty_level SMALLINT NOT NULL DEFAULT 1,
  recommend SMALLINT NOT NULL DEFAULT 0,
  description TEXT,
  content_label TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_contents IS 'コンテンツ管理マスタ';
COMMENT ON COLUMN public.com_m_contents.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_m_contents.content_name IS 'コンテンツ名称';
COMMENT ON COLUMN public.com_m_contents.content_name_en IS 'コンテンツ名称（英語版・任意。コーチ向け画面で使用し、未入力時はcontent_nameにフォールバックする）';
COMMENT ON COLUMN public.com_m_contents.content_type IS 'コンテンツ種別 0:単語・フレーズ, 1:ビデオ, 2:Gabbyスプリント';
COMMENT ON COLUMN public.com_m_contents.content_scope IS 'コンテンツ公開範囲 0:共通, 1:クライアント限定';
COMMENT ON COLUMN public.com_m_contents.seq_no IS 'SEQNO';
COMMENT ON COLUMN public.com_m_contents.difficulty_level IS '難易度';
COMMENT ON COLUMN public.com_m_contents.recommend IS 'おすすめ';
COMMENT ON COLUMN public.com_m_contents.description IS 'コンテンツ説明・解析根拠';
COMMENT ON COLUMN public.com_m_contents.content_label IS 'コンテンツラベル';
COMMENT ON COLUMN public.com_m_contents.metadata IS 'メタデータ（タグなど）';
COMMENT ON COLUMN public.com_m_contents.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_contents.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contents.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view common or assigned corpora" ON public.com_m_contents;

-- content_scope=1（クライアント限定）は、閲覧者自身のclient_idでのアクセス権に加え、
-- コーチが担当する生徒（テナント横断しうる）のclient_idでのアクセス権でも閲覧可能とする
-- (2026-09-03: コーチ向けLesson Sprint教材選択画面でコーパススプリントが表示されない不具合の対応。
--  is_coach_content_accessible()の詳細はDDL/function/is_coach_content_accessible.sqlを参照)
CREATE POLICY "Users can view common or assigned corpora" ON public.com_m_contents
FOR SELECT TO authenticated USING (
    delete_flg = '0'
    AND content_scope <> 9 -- 非公開(9)は常に除外
    AND (
        content_scope = 0
        OR EXISTS (
            SELECT 1 FROM public.com_m_contents_access a
            WHERE a.content_id = public.com_m_contents.content_id
              AND a.client_id = public.get_jwt_client_id()
              AND a.delete_flg = '0'
        )
        OR public.is_coach_content_accessible(public.com_m_contents.content_id)
    )
);
