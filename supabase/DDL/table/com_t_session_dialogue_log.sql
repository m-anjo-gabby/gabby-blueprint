---------------------------------------------
-- DDL: com_t_session_dialogue_log (ライブセッション中のダイアログ教材オープン履歴) (2026-09-21 新規)
---------------------------------------------
-- 【背景】
-- ダイアログプラクティス教材はGoogle Slidesを別タブで開く方式のため、実際にコーチ・生徒が
-- 中身をどう使ったか（完了したか等）をアプリ側から検知することはできない。そのため本テーブルは
-- 「セッション中にどの教材をオープンしたか」という事実のみを、コーチがスライドリンクを
-- クリックした時点で機械的に記録する（＝Completedの主張はしない。完了状態は引き続き
-- com_t_dialogue_session_progressが担う、別概念のログである）。
--
-- 誤って別教材を開いた、同じ教材を開き直した等のケースも含めて起きたことをそのまま記録する方針
-- のため、重複排除・上書き更新は行わない（1クリック=1行の追記のみ、update_dateも持たない）。
--
-- 将来ダイアログ教材をHTML化（アプリ内で完結）する際は、このオープンイベント自体は変わらず
-- 有効なまま、より精度の高い完了シグナル（completed_at・duration_sec等）を追加列や別テーブルで
-- 拡張していく想定（既存のOpenログを置き換える必要はない）。
---------------------------------------------
CREATE TABLE public.com_t_session_dialogue_log (
  log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.com_t_dialogue_assignment(assignment_id) ON DELETE CASCADE,
  dialogue_session_id uuid NOT NULL REFERENCES public.com_m_dialogue_session(dialogue_session_id),
  opened_by_coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_session_dialogue_log IS 'ライブセッション中にコーチがダイアログプラクティス教材のスライドリンクを開いた履歴（オープンの事実のみを記録。完了の意味は持たない）';
COMMENT ON COLUMN public.com_t_session_dialogue_log.log_id IS 'ログID';
COMMENT ON COLUMN public.com_t_session_dialogue_log.session_id IS '対象のライブセッションID (com_t_session.session_id)';
COMMENT ON COLUMN public.com_t_session_dialogue_log.assignment_id IS '対象の割当ID (com_t_dialogue_assignment.assignment_id)';
COMMENT ON COLUMN public.com_t_session_dialogue_log.dialogue_session_id IS '開かれたセッション明細ID (com_m_dialogue_session.dialogue_session_id)';
COMMENT ON COLUMN public.com_t_session_dialogue_log.opened_by_coach_id IS 'リンクを開いたコーチのユーザーID';
COMMENT ON COLUMN public.com_t_session_dialogue_log.insert_date IS 'オープン日時（=登録日時。更新は行わないためupdate_dateは持たない）';

CREATE INDEX idx_session_dialogue_log_session
  ON public.com_t_session_dialogue_log (session_id, insert_date);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_dialogue_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can manage session dialogue logs they created" ON public.com_t_session_dialogue_log;
DROP POLICY IF EXISTS "Students can view their own session dialogue logs" ON public.com_t_session_dialogue_log;

-- [コーチ] 自分が記録したログの閲覧・登録が可能。登録時は、対象セッションが自分の担当かつ
-- 割当の生徒と一致することを検証する（他コーチ・他生徒のセッションへの誤紐づけ防止）
CREATE POLICY "Coaches can manage session dialogue logs they created" ON public.com_t_session_dialogue_log
FOR ALL TO authenticated
USING (
    opened_by_coach_id = auth.uid() OR public.get_jwt_user_type() = '0'
) WITH CHECK (
    opened_by_coach_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.com_t_session s
        JOIN public.com_t_dialogue_assignment a ON a.assignment_id = com_t_session_dialogue_log.assignment_id
        WHERE s.session_id = com_t_session_dialogue_log.session_id
          AND s.coach_id = auth.uid()
          AND s.student_id = a.student_id
    )
);

-- [生徒] 自分が対象のセッションに紐づくログのみ閲覧可能
CREATE POLICY "Students can view their own session dialogue logs" ON public.com_t_session_dialogue_log
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_t_session s
        WHERE s.session_id = com_t_session_dialogue_log.session_id
          AND s.student_id = auth.uid()
    )
);
