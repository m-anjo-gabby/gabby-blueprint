---------------------------------------------
-- DDL: com_m_phrase (出題例文マスタ)
---------------------------------------------
CREATE TABLE public.com_m_phrase (
  phrase_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id uuid NOT NULL REFERENCES public.com_m_word(word_id) ON DELETE CASCADE,
  seq_no SMALLINT NOT NULL DEFAULT 1,
  phrase_type SMALLINT NOT NULL,
  phrase_en TEXT NOT NULL,
  phrase_ja TEXT NOT NULL,
  audio_path TEXT,
  tts_ssml TEXT,
  tts_ssml_mode TEXT NOT NULL DEFAULT 'auto', -- 'auto': UI生成, 'manual': 手動編集
  tts_adjustments JSONB,                      -- ワード単位の調整パラメータ
  tts_status SMALLINT NOT NULL DEFAULT 0, -- 0:未生成, 1:生成済, 2:要再生成, 9:エラー
  last_tts_date TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'live', -- 'live' (公開), 'pending' (非公開)
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_word_phrase_seq UNIQUE(word_id, seq_no)
);

COMMENT ON TABLE public.com_m_phrase IS '出題例文マスタ';
COMMENT ON COLUMN public.com_m_phrase.phrase_id IS 'フレーズID';
COMMENT ON COLUMN public.com_m_phrase.word_id IS '単語ID';
COMMENT ON COLUMN public.com_m_phrase.seq_no IS 'SEQNO';
COMMENT ON COLUMN public.com_m_phrase.phrase_type IS 'フレーズ種別（1: S+V 2: Adding 3: Strategic Solution 4: PAST 5: PRESENT PERFECT）';
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

CREATE INDEX idx_com_m_phrase_word_id ON public.com_m_phrase(word_id);
CREATE INDEX IF NOT EXISTS idx_com_m_phrase_word_status_seq
ON public.com_m_phrase (word_id, status, seq_no ASC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_phrase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view phrases of accessible words" ON public.com_m_phrase;

CREATE POLICY "Users can view phrases of accessible words" ON public.com_m_phrase
FOR SELECT TO authenticated USING (
    status = 'live' -- 公開中のフレーズのみ
    AND EXISTS (
        SELECT 1 FROM public.com_m_word w
        WHERE w.word_id = public.com_m_phrase.word_id
    )
);
