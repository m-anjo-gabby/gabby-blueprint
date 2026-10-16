-- =========================================================================
-- com_m_color_vowel: Color Vowel（母音の色の分類）
-- =========================================================================

-- @schema public.com_m_color_vowel
CREATE TABLE public.com_m_color_vowel (
    cv_id                    character varying(50) PRIMARY KEY,
    cv_name                  text         NOT NULL,
    description              text         NOT NULL,
    icon_path                text         NOT NULL,
    audio_path               text         NOT NULL,
    video_title              text,
    video_path               text,
    delete_flg               integer      NOT NULL DEFAULT 0,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_m_color_vowel IS 'Color Vowelマスタ';
COMMENT ON COLUMN public.com_m_color_vowel.cv_id IS 'Color Vowel ID (スラッグ形式の文字列)';
COMMENT ON COLUMN public.com_m_color_vowel.cv_name IS 'Color Vowel 名称';
COMMENT ON COLUMN public.com_m_color_vowel.description IS '発音の解説・特徴';
COMMENT ON COLUMN public.com_m_color_vowel.icon_path IS 'Storage内のアイコン画像パス';
COMMENT ON COLUMN public.com_m_color_vowel.audio_path IS 'Storage内の音声ファイルパス';
COMMENT ON COLUMN public.com_m_color_vowel.video_title IS '解説動画タイトル';
COMMENT ON COLUMN public.com_m_color_vowel.video_path IS 'Storage内の動画ファイルパス';
COMMENT ON COLUMN public.com_m_color_vowel.delete_flg IS '削除フラグ (0: 有効, 1: 削除済み)';
COMMENT ON COLUMN public.com_m_color_vowel.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_color_vowel.update_date IS '更新日時';

CREATE INDEX idx_com_m_color_vowel_lookup ON public.com_m_color_vowel (cv_id, delete_flg);

ALTER TABLE public.com_m_color_vowel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active color vowels" ON public.com_m_color_vowel FOR SELECT TO authenticated
USING (
    delete_flg = 0
);
-- @end-schema
