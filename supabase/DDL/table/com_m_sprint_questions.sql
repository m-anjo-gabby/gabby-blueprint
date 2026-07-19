---------------------------------------------
-- DDL: com_m_sprint_questions (スプリント問題マスタ)
---------------------------------------------
CREATE TABLE public.com_m_sprint_questions (
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL,                     -- 紐づくコンテンツ（教材）ID (UUID)
  sprint_type TEXT NOT NULL DEFAULT '0',        -- スプリント種別 (0:汎用スプリント, 1:コーパススプリント)
  question_type TEXT NOT NULL,                  -- '0':Speed, '4':Structure, '5':Builders, '6':Mastery
  difficulty_level SMALLINT NOT NULL DEFAULT 1, -- 難易度レベル
  group_id UUID DEFAULT NULL,                   -- 共通グループID (汎用問題の塊)
  seq_no SMALLINT NOT NULL DEFAULT 1,           -- グループ内または教材内での出題順序

  statement_en TEXT DEFAULT NULL,               -- ステートメント（親文・英語）
  statement_ja TEXT DEFAULT NULL,               -- ステートメント（親文・日本語訳）
  statement_voice TEXT DEFAULT NULL,            -- 生成された音声Storageパス
  statement_tts_ssml TEXT DEFAULT NULL,
  statement_tts_ssml_mode TEXT NOT NULL DEFAULT 'auto',
  statement_tts_adjustments JSONB DEFAULT NULL,
  statement_tts_status SMALLINT NOT NULL DEFAULT 0, -- 0:未生成, 1:生成済, 2:要再生成, 9:エラー
  
  question_en TEXT NOT NULL,                    -- クエスチョン（指示文/問い・英語）
  question_ja TEXT DEFAULT NULL,                -- クエスチョン（指示文/問い・日本語訳）
  question_voice TEXT DEFAULT NULL,              -- 生成された音声Storageパス
  question_tts_ssml TEXT DEFAULT NULL,
  question_tts_ssml_mode TEXT NOT NULL DEFAULT 'auto',
  question_tts_adjustments JSONB DEFAULT NULL,
  question_tts_status SMALLINT NOT NULL DEFAULT 0,
  
  answer_sentence_yes_en TEXT NOT NULL,         -- 解答（YES/通常正解文・英語）
  answer_sentence_yes_ja TEXT DEFAULT NULL,         -- 解答（YES/通常正解文・日本語訳）
  answer_sentence_yes_voice TEXT DEFAULT NULL,   -- 生成された音声Storageパス
  answer_sentence_yes_tts_ssml TEXT DEFAULT NULL,
  answer_sentence_yes_tts_ssml_mode TEXT NOT NULL DEFAULT 'auto',
  answer_sentence_yes_tts_adjustments JSONB DEFAULT NULL,
  answer_sentence_yes_tts_status SMALLINT NOT NULL DEFAULT 0,
  
  answer_sentence_no_en TEXT DEFAULT NULL,          -- 解答（NO/否定文・英語 ※Speed専用）
  answer_sentence_no_ja TEXT DEFAULT NULL,          -- 解答（NO/否定文・日本語訳 ※Speed専用）
  answer_sentence_no_voice TEXT DEFAULT NULL,    -- 生成された音声Storageパス
  answer_sentence_no_tts_ssml TEXT DEFAULT NULL,
  answer_sentence_no_tts_ssml_mode TEXT NOT NULL DEFAULT 'auto',
  answer_sentence_no_tts_adjustments JSONB DEFAULT NULL,
  answer_sentence_no_tts_status SMALLINT NOT NULL DEFAULT 0,

  last_tts_date TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- 最終TTS生成日
  legacy_question_id BIGINT DEFAULT NULL,
  legacy_group_id INTEGER DEFAULT NULL,
  delete_flg TEXT NOT NULL DEFAULT '0',                 -- '0':有効, '1':削除済
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_sprint_questions IS 'スプリント問題（汎用・コーパス統合）マスタテーブル';

COMMENT ON COLUMN public.com_m_sprint_questions.question_id IS '問題ユニークID (UUID)';
COMMENT ON COLUMN public.com_m_sprint_questions.content_id IS '紐づくコンテンツ（教材）ID (UUID)';
COMMENT ON COLUMN public.com_m_sprint_questions.sprint_type IS '教材種別 (0:汎用スプリント, 1:コーパススプリント)';
COMMENT ON COLUMN public.com_m_sprint_questions.question_type IS '問題種別 (''0'':Speed, ''4'':Structure, ''5'':Builders, ''6'':Mastery)';
COMMENT ON COLUMN public.com_m_sprint_questions.difficulty_level IS '難易度レベル (0:Basic 〜)';
COMMENT ON COLUMN public.com_m_sprint_questions.group_id IS '共通グループID (問題群をグルーピングするUUID)';
COMMENT ON COLUMN public.com_m_sprint_questions.seq_no IS 'グループ内または教材内での出題順序';

COMMENT ON COLUMN public.com_m_sprint_questions.statement_en IS 'ステートメント（親文・英語）';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_ja IS 'ステートメント（親文・日本語訳）';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_voice IS 'ステートメント生成音声Storageパス';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_tts_ssml IS 'ステートメント用TTS SSMLテキスト';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_tts_ssml_mode IS 'ステートメント用TTS SSML生成モード (auto等)';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_tts_adjustments IS 'ステートメント用TTS調整パラメーター (JSONB)';
COMMENT ON COLUMN public.com_m_sprint_questions.statement_tts_status IS 'ステートメント用TTS生成ステータス (0:未生成, 1:生成済, 2:要再生成, 9:エラー)';

COMMENT ON COLUMN public.com_m_sprint_questions.question_en IS 'クエスチョン（指示文/問い・英語）';
COMMENT ON COLUMN public.com_m_sprint_questions.question_ja IS 'クエスチョン（指示文/問い・日本語訳）';
COMMENT ON COLUMN public.com_m_sprint_questions.question_voice IS 'クエスチョン生成音声Storageパス';
COMMENT ON COLUMN public.com_m_sprint_questions.question_tts_ssml IS 'クエスチョン用TTS SSMLテキスト';
COMMENT ON COLUMN public.com_m_sprint_questions.question_tts_ssml_mode IS 'クエスチョン用TTS SSML生成モード (auto等)';
COMMENT ON COLUMN public.com_m_sprint_questions.question_tts_adjustments IS 'クエスチョン用TTS調整パラメーター (JSONB)';
COMMENT ON COLUMN public.com_m_sprint_questions.question_tts_status IS 'クエスチョン用TTS生成ステータス (0:未生成, 1:生成済, 2:要再生成, 9:エラー)';

COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_en IS '解答（YES/通常正解文・英語）';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_ja IS '解答（YES/通常正解文・日本語訳）';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_voice IS '解答（YES）生成音声Storageパス';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_tts_ssml IS '解答（YES）用TTS SSMLテキスト';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_tts_ssml_mode IS '解答（YES）用TTS SSML生成モード (auto等)';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_tts_adjustments IS '解答（YES）用TTS調整パラメーター (JSONB)';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_yes_tts_status IS '解答（YES）用TTS生成ステータス (0:未生成, 1:生成済, 2:要再生成, 9:エラー)';

COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_en IS '解答（NO/否定文・英語 ※Speed専用）';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_ja IS '解答（NO/否定文・日本語訳 ※Speed専用）';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_voice IS '解答（NO）生成音声Storageパス';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_tts_ssml IS '解答（NO）用TTS SSMLテキスト';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_tts_ssml_mode IS '解答（NO）用TTS SSML生成モード (auto等)';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_tts_adjustments IS '解答（NO）用TTS調整パラメーター (JSONB)';
COMMENT ON COLUMN public.com_m_sprint_questions.answer_sentence_no_tts_status IS '解答（NO）用TTS生成ステータス (0:未生成, 1:生成済, 2:要再生成, 9:エラー)';

COMMENT ON COLUMN public.com_m_sprint_questions.last_tts_date IS '最終TTS音声生成日時';
COMMENT ON COLUMN public.com_m_sprint_questions.legacy_question_id IS '移行元レガシー問題ID';
COMMENT ON COLUMN public.com_m_sprint_questions.legacy_group_id IS '移行元レガシーグループID';
COMMENT ON COLUMN public.com_m_sprint_questions.delete_flg IS '削除フラグ (''0'':有効, ''1'':削除済)';
COMMENT ON COLUMN public.com_m_sprint_questions.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_sprint_questions.update_date IS '更新日時';

CREATE INDEX idx_sprint_questions_general_lookup
ON public.com_m_sprint_questions (sprint_type, question_type, difficulty_level, group_id, seq_no)
WHERE delete_flg = '0';

CREATE INDEX idx_sprint_questions_corpus_lookup
ON public.com_m_sprint_questions (content_id, seq_no)
WHERE delete_flg = '0' AND sprint_type = 1;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_sprint_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select access for authenticated users" ON public.com_m_sprint_questions;
DROP POLICY IF EXISTS "Allow all access for service_role" ON public.com_m_sprint_questions;

GRANT SELECT ON TABLE public.com_m_sprint_questions TO authenticated;

CREATE POLICY "Allow select access for authenticated users" 
ON public.com_m_sprint_questions FOR SELECT TO authenticated
USING (delete_flg = '0');
