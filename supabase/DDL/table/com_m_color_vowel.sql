---------------------------------------------
-- DDL: com_m_color_vowel (Color Vowelマスタ)
---------------------------------------------
CREATE TABLE public.com_m_color_vowel (
    cv_id VARCHAR(50) PRIMARY KEY,
    cv_name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon_path TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    video_title TEXT,
    video_path TEXT,
    delete_flg INT NOT NULL DEFAULT 0,
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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

CREATE INDEX IF NOT EXISTS idx_com_m_color_vowel_lookup
ON public.com_m_color_vowel (cv_id, delete_flg);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_color_vowel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view active color vowels" ON public.com_m_color_vowel;

CREATE POLICY "Users can view active color vowels" ON public.com_m_color_vowel
FOR SELECT TO authenticated 
USING (delete_flg = 0);
