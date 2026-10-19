-- =========================================================================
-- com_m_phrase: フレーズ（出題の例文）
-- =========================================================================
-- 認証済みユーザーは公開中（status='live'）のフレーズだけを参照できる。
-- =========================================================================

-- @schema public.com_m_phrase
CREATE TABLE public.com_m_phrase (
    phrase_id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    word_id                  uuid         NOT NULL REFERENCES public.com_m_word(word_id) ON DELETE CASCADE,
    seq_no                   smallint     NOT NULL DEFAULT 1,
    phrase_type              smallint     NOT NULL,
    phrase_en                text         NOT NULL,
    phrase_ja                text         NOT NULL,
    audio_path               text,
    tts_ssml                 text,
    tts_ssml_mode            text         NOT NULL DEFAULT 'auto'::text,
    tts_adjustments          jsonb,
    tts_status               smallint     NOT NULL DEFAULT 0,
    last_tts_date            timestamp with time zone,
    status                   text         NOT NULL DEFAULT 'live'::text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT unique_word_phrase_seq UNIQUE (word_id, seq_no),
    CONSTRAINT chk_phrase_phrase_type CHECK (phrase_type = ANY (ARRAY[1, 2, 3, 4, 5])),
    CONSTRAINT chk_phrase_status CHECK (status = ANY (ARRAY['live'::text, 'pending'::text])),
    CONSTRAINT chk_phrase_tts_ssml_mode CHECK (tts_ssml_mode = ANY (ARRAY['auto'::text, 'manual'::text])),
    CONSTRAINT chk_phrase_tts_status CHECK (tts_status = ANY (ARRAY[0, 1, 2, 9]))
);

COMMENT ON TABLE public.com_m_phrase IS '出題例文マスタ';
COMMENT ON COLUMN public.com_m_phrase.phrase_id IS 'フレーズID';
COMMENT ON COLUMN public.com_m_phrase.word_id IS '単語ID';
COMMENT ON COLUMN public.com_m_phrase.seq_no IS 'SEQNO';
COMMENT ON COLUMN public.com_m_phrase.phrase_type IS 'フレーズ種別（1: Target Vocabulary 2: Use a Collocation 3: Build a Sentence 4: Use It at Work 5: Expand the Sentence）';
COMMENT ON COLUMN public.com_m_phrase.phrase_en IS 'フレーズ（英語表記）';
COMMENT ON COLUMN public.com_m_phrase.phrase_ja IS 'フレーズ（日本語表記）';
COMMENT ON COLUMN public.com_m_phrase.audio_path IS '音声ファイルパス（Storage）';
COMMENT ON COLUMN public.com_m_phrase.tts_ssml IS 'TTS用SSMLテキスト';
COMMENT ON COLUMN public.com_m_phrase.tts_ssml_mode IS 'TTS用SSML生成モード（auto/manual）';
COMMENT ON COLUMN public.com_m_phrase.tts_adjustments IS 'TTS用ワード単位調整データ（JSON）';
COMMENT ON COLUMN public.com_m_phrase.tts_status IS '音声生成ステータス';
COMMENT ON COLUMN public.com_m_phrase.last_tts_date IS '最終音声生成日時';
COMMENT ON COLUMN public.com_m_phrase.status IS '公開ステータス';
COMMENT ON COLUMN public.com_m_phrase.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_phrase.update_date IS '更新日時';

CREATE INDEX idx_com_m_phrase_word_id ON public.com_m_phrase (word_id);
CREATE INDEX idx_com_m_phrase_word_status_seq ON public.com_m_phrase (word_id, status, seq_no);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_phrase FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_phrase ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view phrases of accessible words" ON public.com_m_phrase FOR SELECT TO authenticated
USING (
    status = 'live'::text AND (EXISTS ( SELECT 1
       FROM public.com_m_word w
      WHERE w.word_id = com_m_phrase.word_id))
);
-- @end-schema
