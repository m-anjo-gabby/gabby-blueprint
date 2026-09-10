---------------------------------------------
-- DDL: com_t_session_reschedule_proposal (コーチキャンセル時の振替候補提案)
---------------------------------------------
-- 【背景】
-- 予約・振替の決定権は生徒側に一本化する方針とし、reschedule_session()/
-- book_makeup_session() は生徒本人のみ実行可能に変更した。一方で、コーチが
-- セッションをキャンセルする際、コーチ側が「都合の良い候補時間」を生徒に
-- 提案できるようにする（決定権はあくまで生徒側にあり、コーチの提案は
-- 参考情報として提示するのみ）。
--
-- 通常の振替(reschedule_session)・新規予約(book_makeup_session)はコーチの
-- Availability(com_m_coach_availability)範囲内のみが対象だが、この提案枠は
-- コーチが「今回に限り」明示的に空けた一回限りの時間帯を含められるよう、
-- Availability外の時間も許可する（承諾時にAvailabilityチェックを行わない）。
--
-- 1回のキャンセルにつき最大3件まで（cancel_session側でチェック）。生徒が
-- そのうち1件を承諾すると、同じsession_idに紐づく他の候補は自動的に
-- declined化される(accept_session_reschedule_proposal参照)。
--
-- 書き込みはcom_t_session本体と同様、直接のINSERT/UPDATEをRLSで許可せず、
-- 必ずSECURITY DEFINER関数(cancel_session / accept_session_reschedule_proposal /
-- decline_session_reschedule_proposal)経由のみとする。
---------------------------------------------
CREATE TABLE public.com_t_session_reschedule_proposal (
    proposal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    proposed_start_datetime timestamp with time zone NOT NULL,
    proposed_end_datetime timestamp with time zone NOT NULL,
    status smallint NOT NULL DEFAULT 1, -- 1:pending 2:accepted 3:declined 4:expired
    expires_at timestamp with time zone NOT NULL,
    responded_at timestamp with time zone,
    resulting_session_id uuid REFERENCES public.com_t_session(session_id), -- accepted時に新規作成されたセッション
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_proposal_status CHECK (status IN (1, 2, 3, 4)),
    CONSTRAINT chk_proposal_time_range CHECK (proposed_end_datetime > proposed_start_datetime)
);

COMMENT ON TABLE public.com_t_session_reschedule_proposal IS 'コーチがキャンセル時に生徒へ提案する振替候補時間（決定権は生徒側。最大3件/キャンセル）';
COMMENT ON COLUMN public.com_t_session_reschedule_proposal.session_id IS '提案元のキャンセルされたセッション (com_t_session)';
COMMENT ON COLUMN public.com_t_session_reschedule_proposal.status IS 'ステータス 1:pending(未回答) 2:accepted(承諾済み) 3:declined(却下/他候補の承諾により自動不採用) 4:expired(期限切れ)';
COMMENT ON COLUMN public.com_t_session_reschedule_proposal.expires_at IS '回答期限。cancel_session実行時に決定した固定値（後から定数を変更しても発行済みの提案には遡って影響しない）';
COMMENT ON COLUMN public.com_t_session_reschedule_proposal.resulting_session_id IS '承諾により新規作成されたcom_t_session行（accepted以外はNULL）';

CREATE INDEX idx_session_reschedule_proposal_session ON public.com_t_session_reschedule_proposal (session_id);
CREATE INDEX idx_session_reschedule_proposal_student_status ON public.com_t_session_reschedule_proposal (student_id, status);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_reschedule_proposal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view reschedule proposals" ON public.com_t_session_reschedule_proposal;

-- [参照] 対象の生徒本人・提案したコーチ本人・管理者のみ閲覧可能。
-- 書き込み(作成・承諾・却下)はすべてSECURITY DEFINER関数経由のみとし、
-- authenticatedロールへのINSERT/UPDATE権限は一切付与しない。
CREATE POLICY "Involved users can view reschedule proposals" ON public.com_t_session_reschedule_proposal
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);
