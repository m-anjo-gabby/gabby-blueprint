-- =========================================================================
-- com_t_session_homework: ライブセッションの宿題（1セッションに1件）
-- =========================================================================
-- 【役割】
-- セッション後にコーチが出す宿題の本文。以降の連絡はフォローアップのコメント（com_t_session_homework_comment）、
-- 添付は com_t_session_homework_attachment に分ける。
--
-- 【書き込み】
-- 宿題の提供はコーチの評価の材料になるため、投稿後の編集・削除はできない（追記のみ）。
-- 登録はコーチ本人が、担当するセッションの担当コーチ・生徒と一致する場合だけ。
-- student_viewed_at（生徒が宿題を最後に開いた日時。生徒のセッション結果画面を開いた時刻）は
-- mark_session_homework_viewed() だけが更新する（生徒に本テーブルの更新権限は与えない）。
-- コーチの画面に、生徒が宿題・最新の追記を見たかを出すのに使う。
--
-- 【参照できる範囲】
-- コーチ本人・対象の生徒本人・管理者（コーチのメモと違い、生徒も参照できる）。
-- =========================================================================

-- @schema public.com_t_session_homework
CREATE TABLE public.com_t_session_homework (
    homework_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id               uuid         NOT NULL UNIQUE REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    student_id               uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    homework_text            text         NOT NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    student_viewed_at        timestamp with time zone,
    CONSTRAINT chk_session_homework_text_not_blank CHECK (btrim(homework_text) <> ''::text)
);

COMMENT ON TABLE public.com_t_session_homework IS 'セッション単位の宿題本体（1セッション1件、コーチのみ投稿、追記専用・生徒も閲覧可）。チェックリスト・フォローアップコメントの親';
COMMENT ON COLUMN public.com_t_session_homework.homework_id IS '宿題ID';
COMMENT ON COLUMN public.com_t_session_homework.session_id IS '対象の個別レッスンセッション (com_t_session)。UNIQUE制約により1セッション1件';
COMMENT ON COLUMN public.com_t_session_homework.coach_id IS '投稿したコーチのユーザID（com_t_session.coach_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework.student_id IS '対象の生徒のユーザID（非正規化。com_t_session.student_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework.homework_text IS '宿題本文（自由メッセージ）';
COMMENT ON COLUMN public.com_t_session_homework.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_session_homework.student_viewed_at IS '生徒が宿題を最後に開いた日時（生徒のセッション結果画面を開いた時刻。未閲覧はNULL）';

CREATE INDEX idx_session_homework_coach ON public.com_t_session_homework (coach_id);
CREATE INDEX idx_session_homework_session ON public.com_t_session_homework (session_id, insert_date DESC);
CREATE INDEX idx_session_homework_student ON public.com_t_session_homework (student_id, insert_date DESC);

CREATE TRIGGER on_session_homework_insert_notify AFTER INSERT ON public.com_t_session_homework FOR EACH ROW EXECUTE FUNCTION public.notify_session_homework_posted();

ALTER TABLE public.com_t_session_homework ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can view session homework" ON public.com_t_session_homework FOR SELECT TO authenticated
USING (
    coach_id = auth.uid() OR student_id = auth.uid() OR public.is_system_admin()
);

CREATE POLICY "Coaches can post homework for their own sessions" ON public.com_t_session_homework FOR INSERT TO authenticated
WITH CHECK (
    coach_id = auth.uid() AND (EXISTS ( SELECT 1
       FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework.session_id AND s.coach_id = auth.uid() AND s.student_id = com_t_session_homework.student_id))
);
-- @end-schema
