-- =========================================================================
-- com_m_color_vowel_dictionary: Color Vowel の辞書
-- =========================================================================
-- 【見出し語と原形】
-- 生徒が文中でタップした出現形（offers, launched 等）で検索するため、見出し語は出現形のまま1行ずつ持つ。
-- 語形変化した行は lemma に原形を持ち、辞書のポップアップに「原形: launch」と出す。辞書データの作成時に、
-- 同じ原形の行どうしで Color Vowel の判断が食い違っていないかの検証にも使う。
-- 原形そのものの行は lemma を NULL にする。原形の行が辞書にあることは必須にしない（外部キーは張らない）。
-- =========================================================================

-- @schema public.com_m_color_vowel_dictionary
CREATE TABLE public.com_m_color_vowel_dictionary (
    dic_id                   uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    word_en                  text         NOT NULL,
    part_of_speech           character varying(20) NOT NULL DEFAULT 'UNKNOWN'::character varying,
    word_ja                  text,
    syllables                character varying(100) NOT NULL,
    primary_stress_syllable  smallint     NOT NULL DEFAULT 1,
    stress_vowel_spelling    character varying(20) NOT NULL,
    cv_id                    character varying(50) NOT NULL REFERENCES public.com_m_color_vowel(cv_id) ON DELETE RESTRICT,
    phonetic_spelling        text,
    audio_path               text,
    tts_ssml                 text,
    tts_ssml_mode            text         NOT NULL DEFAULT 'auto'::text,
    tts_adjustments          jsonb,
    tts_status               smallint     NOT NULL DEFAULT 0,
    last_tts_date            timestamp with time zone,
    status                   text         NOT NULL DEFAULT 'live'::text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    lemma                    text,
    CONSTRAINT unique_word_and_pos UNIQUE (word_en, part_of_speech),
    CONSTRAINT chk_cv_dictionary_status CHECK (status = ANY (ARRAY['live'::text, 'pending'::text])),
    CONSTRAINT chk_cv_dictionary_tts_status CHECK (tts_status = ANY (ARRAY[0, 1, 2, 9]))
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
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_color_vowel_dictionary.lemma IS '原形（例: launched → launch）。見出し語が原形そのものの場合はNULL';

CREATE INDEX idx_com_m_cv_dictionary_lookup ON public.com_m_color_vowel_dictionary (lower(word_en), part_of_speech, status);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_color_vowel_dictionary FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_color_vowel_dictionary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active dictionary records" ON public.com_m_color_vowel_dictionary FOR SELECT TO authenticated
USING (
    status = 'live'::text
);
-- @end-schema
