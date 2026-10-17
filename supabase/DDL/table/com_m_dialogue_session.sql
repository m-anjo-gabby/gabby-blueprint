-- =========================================================================
-- com_m_dialogue_session: ダイアログプラクティスのセッション（教材のセットの明細）
-- =========================================================================
-- セット本体は com_m_contents（ダイアログプラクティスの種別、category_id で Beginner / Intermediate / Advanced / Corpus）の
-- 1行で、本テーブルはその配下のセッション（通常1セットに3〜4セッション）を持つ。
-- コーチ用・生徒用のスライドは Google Slides へのリンク。
-- 教材の見える範囲は教材本体（com_m_contents）の RLS で決まる前提で、明細は有効な行をすべて参照できる。
-- =========================================================================

-- @schema public.com_m_dialogue_session
CREATE TABLE public.com_m_dialogue_session (
    dialogue_session_id      uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
    session_no               smallint     NOT NULL,
    coach_slides_title       text,
    coach_slides_link        text,
    student_slides_title     text,
    student_slides_link      text,
    admin_notes              text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_m_dialogue_session_content_id_session_no_key UNIQUE (content_id, session_no)
);

COMMENT ON TABLE public.com_m_dialogue_session IS 'ダイアログプラクティス セッション明細マスタ（旧COM_M_DIALOGUE_DETAIL / COM_M_TAILOR_MADE_DETAILを統合）';
COMMENT ON COLUMN public.com_m_dialogue_session.dialogue_session_id IS 'セッション明細ID';
COMMENT ON COLUMN public.com_m_dialogue_session.content_id IS '紐づくセット（教材）ID (com_m_contents.content_id、content_type=3)';
COMMENT ON COLUMN public.com_m_dialogue_session.session_no IS 'セット内でのセッション番号（1始まり）';
COMMENT ON COLUMN public.com_m_dialogue_session.coach_slides_title IS 'コーチ用スライドの表示タイトル';
COMMENT ON COLUMN public.com_m_dialogue_session.coach_slides_link IS 'コーチ用スライドのURL（Google Slides）';
COMMENT ON COLUMN public.com_m_dialogue_session.student_slides_title IS '生徒用スライドの表示タイトル';
COMMENT ON COLUMN public.com_m_dialogue_session.student_slides_link IS '生徒用スライドのURL（Google Slides）。汎用教材ではセット内の全セッションで同一リンクを想定、コーパス教材ではコーチ用と同一リンクとなる場合がある';
COMMENT ON COLUMN public.com_m_dialogue_session.admin_notes IS '教材制作・運用メモ（管理者向け。生徒別の学習進捗メモはcom_t_dialogue_session_progress.notesで別管理）';
COMMENT ON COLUMN public.com_m_dialogue_session.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_dialogue_session.update_date IS '更新日時';

CREATE INDEX idx_dialogue_session_content ON public.com_m_dialogue_session (content_id, session_no);

ALTER TABLE public.com_m_dialogue_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select access for authenticated users" ON public.com_m_dialogue_session FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
