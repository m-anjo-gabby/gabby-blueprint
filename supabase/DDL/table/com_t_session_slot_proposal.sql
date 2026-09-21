---------------------------------------------
-- DDL: com_t_session_slot_proposal (セッション日時の候補提案 統合テーブル) (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- 「相手の承認/承諾を要する日時を提案する」という同一の概念を、発生タイミングの違い
-- （キャンセル直後のその場提案か、後から自発的に行う自由予約リクエストか）だけで
-- 別テーブル・別RPC群・別UI導線に分けていた旧com_t_session_reschedule_proposal
-- （コーチ・生徒どちらからでも提案可、特定のキャンセル済みセッションに紐づく、
-- 24時間で自動失効）とcom_t_session_booking_request（生徒のみ提案可、特定の
-- コマ(schedule_id)に紐づく、無期限）を、本テーブルに統合する。
-- 両テーブルの構造差分は以下のカラムで吸収する。
--   - source_session_id: キャンセル起因の場合のみ設定（旧reschedule_proposal.session_id相当）。
--     NULLなら自由予約リクエスト（旧booking_request相当）。
--   - expires_at: 振替候補のみ設定（通常はNOW()+24h）。自由予約リクエストはNULL(無期限)。
--   - reason/reject_reason: 自由予約リクエストのみ使用（振替候補には無かった項目）。
-- 承認/却下/失効のRPCも本統合にあわせて1系統化する
-- （function/approve_slot_proposal.sql, function/reject_slot_proposal.sql参照。
-- 作成はcancel_session()内の振替候補提案ロジックと、create_session_booking_request()
-- （自由予約リクエスト）にそれぞれ残す。両者は「どのタイミングで提案するか」という
-- 事前条件（コーチの空き状況の考慮有無・shortfallチェックの要否等）が本質的に異なるため
-- 統合しない。withdraw（提案者による取り下げ）は現状どおり自由予約リクエストのみに限定し、
-- 振替候補には適用しない（chk_slot_proposal_withdraw_scope制約で機械的に担保する）。
---------------------------------------------
CREATE TABLE public.com_t_session_slot_proposal (
    proposal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES public.com_m_lesson_schedule(schedule_id) ON DELETE CASCADE,
    source_session_id uuid REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    proposed_start_datetime timestamp with time zone NOT NULL,
    proposed_end_datetime timestamp with time zone NOT NULL,
    proposed_by_role smallint NOT NULL, -- 1:生徒が提案 2:コーチが提案
    status smallint NOT NULL DEFAULT 1, -- 1:pending 2:accepted 3:declined 4:withdrawn 5:expired
    expires_at timestamp with time zone, -- 振替候補のみ設定。自由予約リクエストはNULL(無期限)
    reason text DEFAULT NULL, -- 生徒が自由予約リクエスト作成時に任意で添えるメモ
    reject_reason text DEFAULT NULL, -- 却下時に任意で添える理由
    responded_at timestamp with time zone,
    resulting_session_id uuid REFERENCES public.com_t_session(session_id), -- accepted時に新規作成されたセッション（非CASCADE。テストデータ削除時の順序に注意）
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_slot_proposal_time_range CHECK (proposed_end_datetime > proposed_start_datetime),
    CONSTRAINT chk_slot_proposal_role CHECK (proposed_by_role IN (1, 2)),
    CONSTRAINT chk_slot_proposal_status CHECK (status IN (1, 2, 3, 4, 5)),
    -- 自由予約リクエスト(source_session_id IS NULL)は必ず生徒発信。個別予約は生徒のみ可能という
    -- 仕様（コーチは自由予約リクエストを作成できない）をDB側でも機械的に担保する。
    CONSTRAINT chk_slot_proposal_booking_role CHECK (source_session_id IS NOT NULL OR proposed_by_role = 1),
    -- withdrawn(4)は自由予約リクエストのみが取り得る状態（振替候補は取り下げ不可の仕様。
    -- 提案者が任意に取り下げられるのは自由予約リクエストのみで、キャンセル時の振替候補は
    -- 相手の応答か回答期限切れを待つのみ、という現行仕様を維持する）。
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

CREATE INDEX idx_slot_proposal_schedule ON public.com_t_session_slot_proposal (schedule_id);
CREATE INDEX idx_slot_proposal_source_session ON public.com_t_session_slot_proposal (source_session_id);
CREATE INDEX idx_slot_proposal_student_status ON public.com_t_session_slot_proposal (student_id, status);
CREATE INDEX idx_slot_proposal_coach_status ON public.com_t_session_slot_proposal (coach_id, status);
-- コーチ側「申請一覧」画面のHistoryタブ(cursor-basedページング)用
CREATE INDEX idx_slot_proposal_coach_insert_date ON public.com_t_session_slot_proposal (coach_id, insert_date DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_slot_proposal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view slot proposals" ON public.com_t_session_slot_proposal;

-- [参照] 対象の生徒本人・対象コーチ本人・管理者のみ閲覧可能。
-- 書き込み(作成・承認・却下・取下げ)はすべてSECURITY DEFINER関数経由のみとし、
-- authenticatedロールへのINSERT/UPDATE権限は一切付与しない。
CREATE POLICY "Involved users can view slot proposals" ON public.com_t_session_slot_proposal
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);
