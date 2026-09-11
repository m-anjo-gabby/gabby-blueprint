---------------------------------------------
-- DDL: com_t_session_booking_request (未消化チケットによる自由日時の予約リクエスト) (2026-09-11 追加)
---------------------------------------------
-- 【背景】
-- 「振替」という独立概念を廃止し、個別セッションの扱いを「キャンセル」「予約」の
-- 2パターンに単純化する方針への対応。未消化チケット（未割当／キャンセルで返還された
-- もの）を使った新規予約は、従来book_makeup_session()で即時確定していたが、
-- コーチのAvailability制約を撤廃し自由に日時選択できるようにする代わりに、
-- 必ずコーチの承認を要するようにする（ダブルブッキング以外の「コーチの実際の都合」を
-- 承認ステップで担保する）。
--
-- com_t_session_reschedule_proposal（特定のキャンセルに紐づく候補提案）とは異なり、
-- 本テーブルは特定のセッションのキャンセルに紐づかない、単発の新規予約希望を表す
-- （対象は com_m_lesson_schedule 単位＝週n回契約のうち1コマ）。
--
-- 承認されると com_t_session に新規行が作成される（resulting_session_idで参照）。
-- 却下・取下げの場合はチケットは未割当のまま残る。
--
-- 書き込みはcom_t_session本体と同様、直接のINSERT/UPDATEをRLSで許可せず、
-- 必ずSECURITY DEFINER関数(create_session_booking_request / approve_session_booking_request /
-- reject_session_booking_request / withdraw_session_booking_request)経由のみとする。
---------------------------------------------
CREATE TABLE public.com_t_session_booking_request (
    request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES public.com_m_lesson_schedule(schedule_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    requested_start_datetime timestamp with time zone NOT NULL,
    requested_end_datetime timestamp with time zone NOT NULL,
    reason text DEFAULT NULL,
    status smallint NOT NULL DEFAULT 1, -- 1:pending 2:approved 3:rejected 4:withdrawn
    reject_reason text DEFAULT NULL,
    responded_at timestamp with time zone,
    resulting_session_id uuid REFERENCES public.com_t_session(session_id),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_booking_request_status CHECK (status IN (1, 2, 3, 4)),
    CONSTRAINT chk_booking_request_time_range CHECK (requested_end_datetime > requested_start_datetime)
);

COMMENT ON TABLE public.com_t_session_booking_request IS '未消化チケットによる自由日時の新規予約リクエスト（コーチの承認が必要）';
COMMENT ON COLUMN public.com_t_session_booking_request.schedule_id IS '対象の定期スケジュール（コマ。com_m_lesson_schedule）';
COMMENT ON COLUMN public.com_t_session_booking_request.reason IS '生徒が任意で添えるメモ（コーチへの一言）';
COMMENT ON COLUMN public.com_t_session_booking_request.status IS 'ステータス 1:pending(未回答) 2:approved(承認済み) 3:rejected(却下) 4:withdrawn(生徒による取下げ)';
COMMENT ON COLUMN public.com_t_session_booking_request.reject_reason IS 'コーチが却下時に任意で添える理由';
COMMENT ON COLUMN public.com_t_session_booking_request.resulting_session_id IS '承認により新規作成されたcom_t_session行（approved以外はNULL）';

CREATE INDEX idx_session_booking_request_schedule ON public.com_t_session_booking_request (schedule_id);
CREATE INDEX idx_session_booking_request_coach_status ON public.com_t_session_booking_request (coach_id, status);
CREATE INDEX idx_session_booking_request_student_status ON public.com_t_session_booking_request (student_id, status);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_booking_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view booking requests" ON public.com_t_session_booking_request;

-- [参照] 対象の生徒本人・対象コーチ本人・管理者のみ閲覧可能。
-- 書き込み(作成・承認・却下・取下げ)はすべてSECURITY DEFINER関数経由のみとし、
-- authenticatedロールへのINSERT/UPDATE権限は一切付与しない。
CREATE POLICY "Involved users can view booking requests" ON public.com_t_session_booking_request
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);
