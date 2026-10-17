-- =========================================================================
-- com_t_session_slot_proposal: セッションの日時の提案（振替候補・自由予約リクエスト）
-- =========================================================================
-- 【役割】
-- 相手の承諾が必要な日時の提案を1つのテーブルで持つ。2種類あり、列で区別する。
--   振替候補: キャンセル直後にその場で出す提案。source_session_id（キャンセルした回）を持ち、
--             コーチ・生徒どちらからでも出せる。expires_at（通常は24時間後）で失効する。
--   自由予約リクエスト: 生徒が後から出す予約の申請。source_session_id は NULL、期限なし。
--             生徒だけが出せる（CHECK 制約で担保）。reason / reject_reason はこちらだけで使う。
-- 取り下げ（withdrawn=4）は自由予約リクエストだけができる（振替候補は相手の応答か期限切れを待つ。CHECK 制約で担保）。
--
-- 【書き込み】
-- すべて SECURITY DEFINER の関数で行う。作成は cancel_session()（振替候補）と create_session_booking_request()
-- （自由予約リクエスト）で、提案の前提条件（空き時間の考慮・不足の判定等）が違うため別の関数のまま。
-- 承認・却下は approve_slot_proposal / reject_slot_proposal に1本化している。
--
-- 【参照できる範囲】
-- 対象の生徒本人・対象のコーチ本人・管理者。
-- =========================================================================

-- @schema public.com_t_session_slot_proposal
CREATE TABLE public.com_t_session_slot_proposal (
    proposal_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_id              uuid         NOT NULL REFERENCES public.com_m_lesson_schedule(schedule_id) ON DELETE CASCADE,
    source_session_id        uuid         REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    student_id               uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    proposed_start_datetime  timestamp with time zone NOT NULL,
    proposed_end_datetime    timestamp with time zone NOT NULL,
    proposed_by_role         smallint     NOT NULL,
    status                   smallint     NOT NULL DEFAULT 1,
    expires_at               timestamp with time zone,
    reason                   text,
    reject_reason            text,
    responded_at             timestamp with time zone,
    resulting_session_id     uuid         REFERENCES public.com_t_session(session_id) ON DELETE SET NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_slot_proposal_booking_role CHECK (source_session_id IS NOT NULL OR proposed_by_role = 1),
    CONSTRAINT chk_slot_proposal_role CHECK (proposed_by_role = ANY (ARRAY[1, 2])),
    CONSTRAINT chk_slot_proposal_status CHECK (status = ANY (ARRAY[1, 2, 3, 4, 5])),
    CONSTRAINT chk_slot_proposal_time_range CHECK (proposed_end_datetime > proposed_start_datetime),
    CONSTRAINT chk_slot_proposal_withdraw_scope CHECK (status <> 4 OR source_session_id IS NULL)
);

COMMENT ON TABLE public.com_t_session_slot_proposal IS 'セッション日時の候補提案（キャンセル時の振替候補・自由予約リクエストを統合）。相手の承認/承諾を要する日時提案という同一概念の唯一の実体';
COMMENT ON COLUMN public.com_t_session_slot_proposal.schedule_id IS '対象の定期スケジュール（コマ。com_m_lesson_schedule）';
COMMENT ON COLUMN public.com_t_session_slot_proposal.source_session_id IS 'キャンセル起因の場合のみ設定される、提案元のキャンセル済みセッション。NULLなら自由予約リクエスト（特定セッションのキャンセルに紐づかない単発の新規予約希望）';
COMMENT ON COLUMN public.com_t_session_slot_proposal.proposed_by_role IS '提案者 1:生徒が提案（コーチが応答） 2:コーチが提案（生徒が応答）。自由予約リクエストは常に1固定';
COMMENT ON COLUMN public.com_t_session_slot_proposal.status IS 'ステータス 1:pending(未回答) 2:accepted(承諾/承認済み) 3:declined(却下、または他候補の承諾により自動不採用) 4:withdrawn(提案者本人による取り下げ。自由予約リクエストのみ) 5:expired(回答期限切れ。振替候補のみ)';
COMMENT ON COLUMN public.com_t_session_slot_proposal.expires_at IS '回答期限。振替候補は提案(cancel_session)実行時に決定した固定値（後から定数を変更しても発行済みの提案には遡って影響しない）。自由予約リクエストはNULL(無期限)';
COMMENT ON COLUMN public.com_t_session_slot_proposal.reason IS '生徒が自由予約リクエスト作成時に任意で添えるメモ（コーチへの一言）。振替候補では未使用';
COMMENT ON COLUMN public.com_t_session_slot_proposal.reject_reason IS '却下時に任意で添える理由（現状は自由予約リクエストの却下でのみ使用）';
COMMENT ON COLUMN public.com_t_session_slot_proposal.resulting_session_id IS '承諾/承認により新規作成されたcom_t_session行（status=2以外はNULL）';

CREATE INDEX idx_slot_proposal_coach_insert_date ON public.com_t_session_slot_proposal (coach_id, insert_date DESC);
CREATE INDEX idx_slot_proposal_coach_status ON public.com_t_session_slot_proposal (coach_id, status);
CREATE INDEX idx_slot_proposal_schedule ON public.com_t_session_slot_proposal (schedule_id);
CREATE INDEX idx_slot_proposal_source_session ON public.com_t_session_slot_proposal (source_session_id);
CREATE INDEX idx_slot_proposal_student_status ON public.com_t_session_slot_proposal (student_id, status);

ALTER TABLE public.com_t_session_slot_proposal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved users can view slot proposals" ON public.com_t_session_slot_proposal FOR SELECT TO authenticated
USING (
    student_id = auth.uid() OR coach_id = auth.uid() OR public.get_jwt_user_type() = '0'::text
);
-- @end-schema
