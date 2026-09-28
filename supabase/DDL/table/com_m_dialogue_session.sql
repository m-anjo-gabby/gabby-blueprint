---------------------------------------------
-- DDL: com_m_dialogue_session (ダイアログプラクティス セッション明細マスタ) (2026-09-20 新規)
---------------------------------------------
-- 【背景】
-- 旧COM_M_DIALOGUE_DETAIL / COM_M_TAILOR_MADE_DETAILを統合。セット本体は
-- com_m_contents（content_type=3:ダイアログプラクティス、category_idで
-- Beginner/Intermediate/Advanced/Corpusを表現）の1レコードとして登録し、
-- 本テーブルはそのセット配下のセッション（通常3〜4セッション/セット）を管理する。
-- コーチ用・生徒用のスライドはいずれもGoogle Slidesへの外部リンクを想定
-- （本文のHTML化は将来対応、対応時期未定のため現時点ではリンク管理のみ）。
---------------------------------------------
CREATE TABLE public.com_m_dialogue_session (
  dialogue_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES public.com_m_contents(content_id),
  session_no smallint NOT NULL,
  coach_slides_title text,
  coach_slides_link text,
  student_slides_title text,
  student_slides_link text,
  admin_notes text,
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(content_id, session_no)
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
COMMENT ON COLUMN public.com_m_dialogue_session.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_dialogue_session.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_dialogue_session.update_date IS '更新日時';

CREATE INDEX idx_dialogue_session_content
  ON public.com_m_dialogue_session (content_id, session_no)
  WHERE delete_flg = '0';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_dialogue_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select access for authenticated users" ON public.com_m_dialogue_session;

GRANT SELECT ON TABLE public.com_m_dialogue_session TO authenticated;

-- com_m_sprint_questionsと同様、教材本体（com_m_contents）側のRLSで可視性が制御されている
-- 前提のもと、明細テーブル自体は有効行を全件SELECT可能とする
CREATE POLICY "Allow select access for authenticated users"
ON public.com_m_dialogue_session FOR SELECT TO authenticated
USING (delete_flg = '0');
