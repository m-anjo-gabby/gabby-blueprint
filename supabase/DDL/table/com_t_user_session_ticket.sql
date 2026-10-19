-- =========================================================================
-- com_t_user_session_ticket: ライブセッションのチケット（回数）
-- =========================================================================
-- 【役割】
-- 契約に付くライブセッションの回数を生徒ごとに持つ。ライセンス（利用権と期間）とは分け、本テーブルは
-- 消化する回数だけを扱う。有効期間はライセンスと同じため期間の列は持たず、license_id に1対1で紐づける。
--
-- 【消化と返還】
-- used_sessions は予約ではなく実施の確定で加算する（fn_consume_session_ticket。実施完了・早期終了・
-- 生徒の欠席のいずれも消化する）。実施前のキャンセルは消化しない。確定後の取り消し（アドミンの修正等）は
-- fn_restore_session_ticket で減算する。加算・減算は com_t_user_session_ticket_history に記録する。
--
-- 【参照できる範囲】
-- 本人・契約先の顧客に加えて、担当関係（com_m_coach_student_relationship。交代後も含む）にあるコーチ
-- （Student Overview で契約の回数に対する未予約の回を出すため）。
-- =========================================================================

-- @schema public.com_t_user_session_ticket
CREATE TABLE public.com_t_user_session_ticket (
    ticket_id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    license_id               uuid         NOT NULL UNIQUE REFERENCES public.com_t_user_license(license_id) ON DELETE RESTRICT,
    contract_id              uuid         NOT NULL REFERENCES public.com_m_contract(contract_id) ON DELETE RESTRICT,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    weekly_frequency         smallint     NOT NULL,
    total_sessions           smallint     NOT NULL,
    used_sessions            smallint     NOT NULL DEFAULT 0,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_ticket_used_sessions_range CHECK (used_sessions >= 0 AND used_sessions <= total_sessions),
    CONSTRAINT chk_ticket_weekly_frequency CHECK (weekly_frequency >= 1)
);

COMMENT ON TABLE public.com_t_user_session_ticket IS 'ライブセッションチケット実体（生徒単位の消化管理。com_t_user_licenseと1:1）';
COMMENT ON COLUMN public.com_t_user_session_ticket.ticket_id IS 'チケットID';
COMMENT ON COLUMN public.com_t_user_session_ticket.license_id IS '紐づくBlueprintライセンス（1:1、有効期間はこちらに準じる）';
COMMENT ON COLUMN public.com_t_user_session_ticket.contract_id IS '契約ID（集計用の非正規化参照）';
COMMENT ON COLUMN public.com_t_user_session_ticket.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_user_session_ticket.weekly_frequency IS '週あたりのライブセッション回数（1以上）';
COMMENT ON COLUMN public.com_t_user_session_ticket.total_sessions IS '契約期間内の総チケット数';
COMMENT ON COLUMN public.com_t_user_session_ticket.used_sessions IS '消化済み数（将来の予約管理がセッション実施完了時に加算）';
COMMENT ON COLUMN public.com_t_user_session_ticket.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_session_ticket.update_date IS '更新日時';

CREATE INDEX idx_session_ticket_contract ON public.com_t_user_session_ticket (contract_id);
CREATE INDEX idx_session_ticket_user ON public.com_t_user_session_ticket (user_id);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_t_user_session_ticket FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_t_user_session_ticket ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view session tickets of their students" ON public.com_t_user_session_ticket FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = com_t_user_session_ticket.user_id AND r.coach_id = auth.uid()))
);

CREATE POLICY "Users can view their own session tickets" ON public.com_t_user_session_ticket FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);
-- @end-schema
