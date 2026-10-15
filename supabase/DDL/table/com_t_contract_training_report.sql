-- =========================================================================
-- com_t_contract_training_report: 契約ごとのトレーニングレポートのコーチのコメント
-- =========================================================================
-- 【役割】
-- 契約（ticket）のトレーニング完了時に作るレポートに載せる、コーチのコメント。
-- 契約×コーチで1件（週2回契約等で分担する場合は、1つの契約に分担コーチの数だけ行がある）。
-- コーチ自分用の追記型のメモ（com_t_coach_student_note）とは別物。
--
-- 【ステータスと更新】
-- 1:下書き → 2:確定 の一方向。コーチは自分の下書きの行だけを更新でき（コメントの編集と確定の両方）、
-- 確定した行は以後更新できない。単一テーブルの単純な更新のため RPC にせず、RLS で制御している。
-- 登録は現在担当している生徒の、その生徒のチケットに対してだけ。削除は許可しない（確定の履歴として残す）。
--
-- 【参照できる範囲】
-- 自分の行は常に参照できる。他のコーチの行は確定済みのものだけ、担当関係（稼働中・終了を問わない）が
-- あれば参照できる（下書きの途中は他のコーチに見せない）。管理者はすべて参照できる。
-- =========================================================================

-- @schema public.com_t_contract_training_report
CREATE TABLE public.com_t_contract_training_report (
    report_id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id                uuid         NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE CASCADE,
    student_id               uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id),
    comment_text             text         NOT NULL DEFAULT ''::text,
    status                   smallint     NOT NULL DEFAULT 1,
    finalized_at             timestamp with time zone,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_contract_training_report_ticket_id_coach_id_key UNIQUE (ticket_id, coach_id),
    CONSTRAINT chk_training_report_status CHECK (status = ANY (ARRAY[1, 2]))
);

COMMENT ON TABLE public.com_t_contract_training_report IS '契約(ticket)単位のトレーニングレポート・コーチコメント（ticket×coachで1件、draft→finalizedの一方向遷移）';
COMMENT ON COLUMN public.com_t_contract_training_report.report_id IS 'レポートID';
COMMENT ON COLUMN public.com_t_contract_training_report.ticket_id IS '対象の契約(ライブセッションチケット)ID';
COMMENT ON COLUMN public.com_t_contract_training_report.student_id IS '対象の生徒のユーザID（集計用の非正規化参照）';
COMMENT ON COLUMN public.com_t_contract_training_report.coach_id IS '記入したコーチのユーザID';
COMMENT ON COLUMN public.com_t_contract_training_report.comment_text IS 'コメント本文';
COMMENT ON COLUMN public.com_t_contract_training_report.status IS 'ステータス 1:draft(一時保存) 2:finalized(確定・以後編集不可)';
COMMENT ON COLUMN public.com_t_contract_training_report.finalized_at IS '確定日時（status=finalizedになった時刻）';
COMMENT ON COLUMN public.com_t_contract_training_report.insert_date IS '登録日時（下書き作成日時）';
COMMENT ON COLUMN public.com_t_contract_training_report.update_date IS '更新日時';

CREATE INDEX idx_contract_training_report_coach ON public.com_t_contract_training_report (coach_id);
CREATE INDEX idx_contract_training_report_student ON public.com_t_contract_training_report (student_id);

ALTER TABLE public.com_t_contract_training_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can create their own draft training reports" ON public.com_t_contract_training_report FOR INSERT TO authenticated
WITH CHECK (
    coach_id = auth.uid() AND (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.coach_id = auth.uid() AND r.student_id = com_t_contract_training_report.student_id AND r.is_active = true)) AND (EXISTS ( SELECT 1
       FROM public.com_t_user_session_ticket t
      WHERE t.ticket_id = com_t_contract_training_report.ticket_id AND t.user_id = com_t_contract_training_report.student_id))
);

CREATE POLICY "Coaches can update their own draft training reports" ON public.com_t_contract_training_report FOR UPDATE TO authenticated
USING (
    coach_id = auth.uid() AND status = 1
)
WITH CHECK (
    coach_id = auth.uid()
);

CREATE POLICY "Coaches can view training reports of their students" ON public.com_t_contract_training_report FOR SELECT TO authenticated
USING (
    coach_id = auth.uid() OR status = 2 AND (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.coach_id = auth.uid() AND r.student_id = com_t_contract_training_report.student_id)) OR public.get_jwt_user_type() = '0'::text
);
-- @end-schema
