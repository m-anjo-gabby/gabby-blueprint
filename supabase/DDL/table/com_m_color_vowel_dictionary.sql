---------------------------------------------
-- DDL: com_m_color_vowel_dictionary (Color Vowel辞書マスタ)
---------------------------------------------
CREATE TABLE public.com_m_color_vowel_dictionary (
    dic_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_en TEXT NOT NULL,
    part_of_speech VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    word_ja TEXT,
    syllables VARCHAR(100) NOT NULL,                       -- 例: 'tai-lor', 'made', 'rec-ord'
    primary_stress_syllable SMALLINT NOT NULL DEFAULT 1,
    stress_vowel_spelling VARCHAR(20) NOT NULL,            -- 例:ストレス母音の綴り（例: 'ai', 'a', 'ord'）
    cv_id VARCHAR(50) NOT NULL REFERENCES public.com_m_color_vowel(cv_id) ON DELETE CASCADE,
    phonetic_spelling TEXT,
    audio_path TEXT,
    tts_ssml TEXT,
    tts_ssml_mode TEXT NOT NULL DEFAULT 'auto',
    tts_adjustments JSONB,
    tts_status SMALLINT NOT NULL DEFAULT 0,
    last_tts_date TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'live',
    delete_flg SMALLINT NOT NULL DEFAULT 0,
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_word_and_pos UNIQUE(word_en, part_of_speech)
);

COMMENT ON TABLE public.com_m_color_vowel_dictionary IS 'Color Vowel辞書マスタ';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.dic_id IS '辞書ID';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.word_en IS '英単語（検索キー・出現形含む）';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.part_of_speech IS '品詞（例: NOUN, VERB, ADJ, UNKNOWN 等）';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.word_ja IS '日本語訳';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.syllables IS 'ハイフン区切りの音節データ';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.primary_stress_syllable IS '第一アクセントがある音節インデックス（1始まり）';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.stress_vowel_spelling IS '対象音節内で下線を引く対象となる母音の綴り';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.cv_id IS '対応するColor Vowel ID';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.phonetic_spelling IS '発音記号（IPA）';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.audio_path IS '単語音声ファイルパス（Storage）';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.tts_ssml IS 'TTS用SSMLテキスト';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.tts_ssml_mode IS 'TTS用SSML生成モード（auto/manual）';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.tts_adjustments IS 'TTS用ワード単位調整データ（JSON）';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.tts_status IS '音声生成ステータス（0:未生成, 1:生成済, 2:要再生成, 9:エラー）';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.last_tts_date IS '最終音声生成日時';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.status IS '公開ステータス';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.delete_flg IS '削除フラグ（0:有効, 1:削除）';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.update_date IS '更新日時';

CREATE INDEX IF NOT EXISTS idx_com_m_cv_dictionary_lookup
ON public.com_m_color_vowel_dictionary (LOWER(word_en), part_of_speech, status)
WHERE delete_flg = 0;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_color_vowel_dictionary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view active dictionary records" ON public.com_m_color_vowel_dictionary;

CREATE POLICY "Users can view active dictionary records" ON public.com_m_color_vowel_dictionary
FOR SELECT TO authenticated 
USING (status = 'live' AND delete_flg = 0);
