---------------------------------------------
-- DDL: com_t_contract_training_report (契約単位トレーニングレポート・コーチコメント) (2026-09-16 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- 契約(ticket)ごとのトレーニング完了時に作成する「レポート」に載せる、コーチからの
-- コメント欄。com_t_coach_student_note（コーチ自分専用・追記型履歴）とは異なり、
-- 本テーブルは (1) 契約(ticket_id)×コーチ(coach_id)で1件、(2) 一時保存(draft)→確定
-- (finalized)の一方向ステータス遷移で確定後は編集不可、(3) 確定済みのものは同じ生徒を
-- 担当している他コーチからも参照可能、という性質を持つ。
--
-- 週2回契約等でコーチが分担しているケースでは、契約(ticket)に対して分担コーチそれぞれが
-- 自分の担当分についてコメントを持つため、1契約に複数コーチ分の行が並ぶことを許容する
-- （UNIQUE(ticket_id, coach_id)。単独コーチ運用時は実質「契約に1件」になる）。
-- ドラフト中は書いたコーチ本人以外には見せない（他コーチが下書きの途中経過に影響されないため）。
--
-- 【更新ルール】
-- 更新は「自分のdraft行のコメント編集」「自分のdraft行をfinalizedへ確定」の2種類のみで、
-- どちらも単一テーブル・単純な列更新のため、RPC化せず直接UPDATE + RLSで制御する
-- （CLAUDE.mdのRPC化基準：複数テーブル/トランザクション/RLSを越える認可判定が必要な場合のみRPC化）。
-- status=2(finalized)になった行はUPDATEポリシーのUSING句(status=1)により以後一切更新不可となる。
---------------------------------------------
CREATE TABLE public.com_t_contract_training_report (
    report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE, -- 集計高速化用の非正規化参照（com_t_user_session_ticketと同パターン）
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    comment_text text NOT NULL DEFAULT '',
    status smallint NOT NULL DEFAULT 1, -- 1:draft(一時保存) 2:finalized(確定・以後編集不可)
    finalized_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    UNIQUE (ticket_id, coach_id),
    CONSTRAINT chk_training_report_status CHECK (status IN (1, 2))
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

CREATE INDEX idx_contract_training_report_student ON public.com_t_contract_training_report (student_id);
CREATE INDEX idx_contract_training_report_coach ON public.com_t_contract_training_report (coach_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_contract_training_report ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can view training reports of their students" ON public.com_t_contract_training_report;
DROP POLICY IF EXISTS "Coaches can create their own draft training reports" ON public.com_t_contract_training_report;
DROP POLICY IF EXISTS "Coaches can update their own draft training reports" ON public.com_t_contract_training_report;

-- [参照] 自分が記入した行（draft/finalizedいずれも）は常に参照可能。
-- 他コーチの行は status=finalized になったものだけ、担当関係(is_activeを問わず。
-- 引き継ぎ後の閲覧を想定)がある場合に参照可能。ドラフト中は他コーチから不可視。
-- 管理者は全件参照可能。
CREATE POLICY "Coaches can view training reports of their students" ON public.com_t_contract_training_report
FOR SELECT TO authenticated USING (
    coach_id = auth.uid()
    OR (
        status = 2
        AND EXISTS (
            SELECT 1 FROM public.com_m_coach_student_relationship r
            WHERE r.coach_id = auth.uid() AND r.student_id = com_t_contract_training_report.student_id
        )
    )
    OR public.get_jwt_user_type() = '0'
);

-- [登録] 自分自身をcoach_idとしてのみ作成可能。現役の担当関係(is_active=true)がある生徒に対してのみ、
-- かつ対象ticketが実際にその生徒のものであることを要求する。
CREATE POLICY "Coaches can create their own draft training reports" ON public.com_t_contract_training_report
FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.coach_id = auth.uid() AND r.student_id = com_t_contract_training_report.student_id AND r.is_active = true
    )
    AND EXISTS (
        SELECT 1 FROM public.com_t_user_session_ticket t
        WHERE t.ticket_id = com_t_contract_training_report.ticket_id AND t.user_id = com_t_contract_training_report.student_id
    )
);

-- [更新] 自分の行かつ現在draftのものだけ更新可能（finalized行はUSING句がfalseになるため
-- 以後一切更新できない = 確定後編集不可を実現）。この1ポリシーで「下書き編集」と
-- 「finalizedへの確定」の両方をカバーする。
CREATE POLICY "Coaches can update their own draft training reports" ON public.com_t_contract_training_report
FOR UPDATE TO authenticated USING (
    coach_id = auth.uid() AND status = 1
) WITH CHECK (
    coach_id = auth.uid()
);

-- 削除は許可しない（確定履歴として保持するため、authenticatedロールへのDELETE権限は付与しない）。
