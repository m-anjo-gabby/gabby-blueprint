---------------------------------------------
-- DDL: com_t_matching_request (専属コーチマッチングリクエスト) (2026-08-15 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_user_session_ticket.sql, table/com_m_coach_availability.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- ライブセッション付き契約の生徒が、希望コーチに対して「毎週◯曜◯時」の
-- 専属レッスン枠をリクエストし、コーチが承認/否認するためのテーブル。
-- 週n回契約の場合、生徒は枠の数だけ（slot_noごとに）リクエストを行う
-- （週2回契約で別々のコーチにリクエストすることも許容する）。
-- 承認されると public.approve_matching_request() が呼ばれ、
-- com_m_lesson_schedule（定期スケジュール）とcom_t_session（個別回）が
-- 自動生成される。ステータス変更（承認/否認）はRLSでの直接UPDATEを許可せず、
-- 常に approve_matching_request() / reject_matching_request() （いずれもSECURITY DEFINER）
-- 経由に限定する。
---------------------------------------------
CREATE TABLE public.com_t_matching_request (
    request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    slot_no smallint NOT NULL, -- 週n回契約のうち何枠目のリクエストか（1始まり）
    requested_day_of_week smallint NOT NULL, -- 0:日 ... 6:土（coach_idのローカル時刻基準）
    requested_start_time time NOT NULL,
    requested_end_time time NOT NULL,
    status smallint NOT NULL DEFAULT 1, -- 1:pending 2:approved 3:rejected 4:cancelled
    reject_reason text DEFAULT NULL,
    responded_by uuid REFERENCES public.com_m_user(id),
    responded_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_matching_request_slot_no CHECK (slot_no >= 1),
    CONSTRAINT chk_matching_request_day CHECK (requested_day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_matching_request_time_range CHECK (requested_end_time > requested_start_time),
    CONSTRAINT chk_matching_request_status CHECK (status IN (1, 2, 3, 4)),
    CONSTRAINT chk_matching_request_status_fields CHECK (
        (status = 1 AND responded_by IS NULL AND responded_at IS NULL AND reject_reason IS NULL)
        OR
        (status = 2 AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
        OR
        (status = 3 AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND reject_reason IS NOT NULL)
        OR
        (status = 4)
    )
);

COMMENT ON TABLE public.com_t_matching_request IS '専属コーチマッチングリクエスト（生徒→コーチ。承認でlesson_schedule/sessionを自動生成）';
COMMENT ON COLUMN public.com_t_matching_request.request_id IS 'リクエストID';
COMMENT ON COLUMN public.com_t_matching_request.ticket_id IS '対象のライブセッションチケット (com_t_user_session_ticket)';
COMMENT ON COLUMN public.com_t_matching_request.student_id IS '生徒のユーザID';
COMMENT ON COLUMN public.com_t_matching_request.coach_id IS '希望コーチのユーザID';
COMMENT ON COLUMN public.com_t_matching_request.slot_no IS '週n回契約のうち何枠目か（1始まり。枠ごとに別コーチも可）';
COMMENT ON COLUMN public.com_t_matching_request.requested_day_of_week IS '希望曜日 0:日 ... 6:土（コーチのローカル時刻基準）';
COMMENT ON COLUMN public.com_t_matching_request.requested_start_time IS '希望レッスン開始時刻（コーチのローカル時刻）';
COMMENT ON COLUMN public.com_t_matching_request.requested_end_time IS '希望レッスン終了時刻（コーチのローカル時刻、通常25分）';
COMMENT ON COLUMN public.com_t_matching_request.status IS 'ステータス 1:pending(承認待ち) 2:approved(承認) 3:rejected(否認) 4:cancelled(生徒による取消)';
COMMENT ON COLUMN public.com_t_matching_request.reject_reason IS '否認理由（コーチ入力必須）';
COMMENT ON COLUMN public.com_t_matching_request.responded_by IS '承認/否認を行ったコーチのユーザID';
COMMENT ON COLUMN public.com_t_matching_request.responded_at IS '承認/否認日時';
COMMENT ON COLUMN public.com_t_matching_request.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_matching_request.update_date IS '更新日時';

-- 同一チケット・同一枠について、承認待ち/承認済みのリクエストは同時に1件のみ許容する
CREATE UNIQUE INDEX uq_matching_request_active_slot ON public.com_t_matching_request (ticket_id, slot_no)
    WHERE status IN (1, 2);

CREATE INDEX idx_matching_request_student ON public.com_t_matching_request (student_id, status);
CREATE INDEX idx_matching_request_coach ON public.com_t_matching_request (coach_id, status);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_matching_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view matching requests" ON public.com_t_matching_request;
DROP POLICY IF EXISTS "Students can create their own matching requests" ON public.com_t_matching_request;
DROP POLICY IF EXISTS "Students can cancel their own pending requests" ON public.com_t_matching_request;

-- [参照] 生徒本人・宛先コーチ・管理者のみ閲覧可能
CREATE POLICY "Involved users can view matching requests" ON public.com_t_matching_request
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- [登録] 生徒本人が、自身のチケットに対してのみリクエストを作成可能
CREATE POLICY "Students can create their own matching requests" ON public.com_t_matching_request
FOR INSERT TO authenticated WITH CHECK (
    student_id = auth.uid()
    AND ticket_id IN (
        SELECT ticket_id FROM public.com_t_user_session_ticket WHERE user_id = auth.uid()
    )
);

-- [取消] 生徒本人がpending状態の自身のリクエストのみ取消（status=4）可能。承認/否認はRPC経由のみ。
CREATE POLICY "Students can cancel their own pending requests" ON public.com_t_matching_request
FOR UPDATE TO authenticated
USING (student_id = auth.uid() AND status = 1)
WITH CHECK (student_id = auth.uid() AND status = 4);

-- 承認/否認（status: 1→2, 1→3）は approve_matching_request() / reject_matching_request()
-- （SECURITY DEFINER）からのみ実行可能。コーチによる直接UPDATEは許可しない。
