-- =========================================================================
-- com_m_sprint_questions: スプリントの問題（汎用・コーパス共通）
-- =========================================================================
-- 【参照】
-- 認証済みユーザーは削除されていない問題を参照できる。登録・更新はアドミン（service_role）が行う。
--
-- 【インデックス】
-- 教材ごとの取得（content_id＋種別＋レベル）と、問題がある種別×レベルの集計（get_sprint_available_levels）は
-- idx_sprint_questions_content_level を使う。コーパス教材の問題にも sprint_type='0' が入っているため、
-- idx_sprint_questions_corpus_lookup は実際には使われていない。
-- =========================================================================

-- @schema public.com_m_sprint_questions
CREATE TABLE public.com_m_sprint_questions (
    question_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    content_id               uuid         NOT NULL,
    sprint_type              text         NOT NULL DEFAULT '0'::text,
    question_type            text         NOT NULL,
    difficulty_level         smallint     NOT NULL DEFAULT 1,
    group_id                 uuid,
    seq_no                   smallint     NOT NULL DEFAULT 1,
    statement_en             text,
    statement_ja             text,
    statement_voice          text,
    statement_tts_ssml       text,
    statement_tts_ssml_mode  text         NOT NULL DEFAULT 'auto'::text,
    statement_tts_adjustments jsonb,
    statement_tts_status     smallint     NOT NULL DEFAULT 0,
    question_en              text         NOT NULL,
    question_ja              text,
    question_voice           text,
    question_tts_ssml        text,
    question_tts_ssml_mode   text         NOT NULL DEFAULT 'auto'::text,
    question_tts_adjustments jsonb,
    question_tts_status      smallint     NOT NULL DEFAULT 0,
    answer_sentence_yes_en   text         NOT NULL,
    answer_sentence_yes_ja   text,
    answer_sentence_yes_voice text,
    answer_sentence_yes_tts_ssml text,
    answer_sentence_yes_tts_ssml_mode text         NOT NULL DEFAULT 'auto'::text,
    answer_sentence_yes_tts_adjustments jsonb,
    answer_sentence_yes_tts_status smallint     NOT NULL DEFAULT 0,
    answer_sentence_no_en    text,
    answer_sentence_no_ja    text,
    answer_sentence_no_voice text,
    answer_sentence_no_tts_ssml text,
    answer_sentence_no_tts_ssml_mode text         NOT NULL DEFAULT 'auto'::text,
    answer_sentence_no_tts_adjustments jsonb,
    answer_sentence_no_tts_status smallint     NOT NULL DEFAULT 0,
    last_tts_date            timestamp with time zone,
    legacy_question_id       bigint,
    legacy_group_id          integer,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
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
COMMENT ON COLUMN public.com_m_sprint_questions.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_sprint_questions.update_date IS '更新日時';

CREATE INDEX idx_sprint_questions_content_level ON public.com_m_sprint_questions (content_id, question_type, difficulty_level);
CREATE INDEX idx_sprint_questions_corpus_lookup ON public.com_m_sprint_questions (content_id, seq_no) WHERE sprint_type = '1'::text;
CREATE INDEX idx_sprint_questions_general_lookup ON public.com_m_sprint_questions (sprint_type, question_type, difficulty_level, group_id, seq_no);

ALTER TABLE public.com_m_sprint_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select access for authenticated users" ON public.com_m_sprint_questions FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
