-- =========================================================================
-- com_m_contents: 教材
-- =========================================================================
-- 【公開範囲（content_scope）】
-- 0: 全体に公開 / 1: 顧客限定（com_m_contents_access で許可した顧客だけ）。
-- 顧客限定の教材は、閲覧者自身の顧客のアクセス権に加え、コーチが担当する生徒（顧客をまたぐことがある）の
-- 顧客のアクセス権でも参照できる（is_coach_content_accessible()。コーチの Lesson Sprint の教材選択用）。
--
-- 【ダイアログプラクティスの教材】
-- content_type で種別を分け、ダイアログ教材もこのテーブルで持つ（汎用・顧客専用を content_scope で区別）。
-- category_id（Beginner / Intermediate / Advanced / Corpus）はコーチの教材選択画面のタブに対応する分類で、
-- 公開範囲とは独立に設定する（組み合わせの制約は無い）。他の種別では NULL。
-- =========================================================================

-- @schema public.com_m_contents
CREATE TABLE public.com_m_contents (
    content_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    content_name             text         NOT NULL,
    content_type             smallint     NOT NULL DEFAULT 1,
    content_scope            smallint     NOT NULL DEFAULT 0,
    seq_no                   smallint     NOT NULL DEFAULT 1,
    difficulty_level         smallint     NOT NULL DEFAULT 1,
    recommend                smallint     NOT NULL DEFAULT 0,
    description              text,
    content_label            text         NOT NULL,
    metadata                 jsonb        NOT NULL DEFAULT '{}'::jsonb,
    delete_flg               text         NOT NULL DEFAULT '0'::text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    content_name_en          text,
    category_id              smallint
);

COMMENT ON TABLE public.com_m_contents IS 'コンテンツ管理マスタ';
COMMENT ON COLUMN public.com_m_contents.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_m_contents.content_name IS 'コンテンツ名称';
COMMENT ON COLUMN public.com_m_contents.content_type IS 'コンテンツ種別 0:単語・フレーズ, 1:ビデオ, 2:Gabbyスプリント, 3:ダイアログプラクティス';
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
COMMENT ON COLUMN public.com_m_contents.content_name_en IS 'コンテンツ名称（英語版・任意。コーチ向け画面で使用し、未入力時はcontent_nameにフォールバックする）';
COMMENT ON COLUMN public.com_m_contents.category_id IS 'セット分類ID（現状ダイアログプラクティスのみで使用。1:Beginner, 2:Intermediate, 3:Advanced, 4:Corpus）。他コンテンツ種別では未使用のためNULL';

ALTER TABLE public.com_m_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view common or assigned corpora" ON public.com_m_contents FOR SELECT TO authenticated
USING (
    delete_flg = '0'::text AND content_scope <> 9 AND (content_scope = 0 OR (EXISTS ( SELECT 1
       FROM public.com_m_contents_access a
      WHERE a.content_id = com_m_contents.content_id AND a.client_id = public.get_jwt_client_id() AND a.delete_flg = '0'::text)) OR public.is_coach_content_accessible(content_id))
);
-- @end-schema
