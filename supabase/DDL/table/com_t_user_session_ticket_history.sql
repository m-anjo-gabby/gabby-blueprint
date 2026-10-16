-- =========================================================================
-- com_t_user_session_ticket_history: ライブセッションのチケットの変更履歴（監査ログ）
-- =========================================================================
-- チケットの発行・消化・返還・解除を、いつ・誰が・何回分・なぜ行ったかを追記して残す。
-- チケットはライセンスの削除に連動して消えることがあるため、ticket_id に外部キーは張らない。
-- 書き込みは service_role と SECURITY DEFINER の関数だけ。参照の範囲は com_t_user_session_ticket と同じ。
-- =========================================================================

-- @schema public.com_t_user_session_ticket_history
CREATE TABLE public.com_t_user_session_ticket_history (
    history_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id                uuid         NOT NULL,
    contract_id              uuid         REFERENCES public.com_m_contract(contract_id),
    user_id                  uuid         REFERENCES public.com_m_user(id),
    action                   text         NOT NULL,
    sessions_delta           smallint     NOT NULL,
    used_sessions_after      smallint     NOT NULL,
    total_sessions           smallint     NOT NULL,
    note                     text,
    performed_by             uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_at             timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_user_session_ticket_history_action_check CHECK (action = ANY (ARRAY['granted'::text, 'consumed'::text, 'restored'::text, 'removed'::text]))
);

COMMENT ON TABLE public.com_t_user_session_ticket_history IS 'ライブセッションチケット変更履歴（発行・消化・復元・解除の追記専用ログ）';
COMMENT ON COLUMN public.com_t_user_session_ticket_history.ticket_id IS '対象のチケットID（com_t_user_session_ticket, FKなし）';
COMMENT ON COLUMN public.com_t_user_session_ticket_history.action IS '操作種別 granted:発行 / consumed:消化(実施完了) / restored:復元(振替等) / removed:解除(ライセンス解除に伴う削除)';
COMMENT ON COLUMN public.com_t_user_session_ticket_history.sessions_delta IS '変動量。granted/restoredは正の値、consumedは負の値、removedは0';
COMMENT ON COLUMN public.com_t_user_session_ticket_history.used_sessions_after IS '記録時点の消化済み数';
COMMENT ON COLUMN public.com_t_user_session_ticket_history.total_sessions IS '記録時点の総チケット数';
COMMENT ON COLUMN public.com_t_user_session_ticket_history.note IS '振替理由・調整理由等のメモ';
COMMENT ON COLUMN public.com_t_user_session_ticket_history.performed_by IS '操作を行った管理者のUUID（不明時はNULL）';
COMMENT ON COLUMN public.com_t_user_session_ticket_history.performed_at IS '操作日時';

CREATE INDEX idx_session_ticket_history_contract ON public.com_t_user_session_ticket_history (contract_id, performed_at DESC);
CREATE INDEX idx_session_ticket_history_user ON public.com_t_user_session_ticket_history (user_id, performed_at DESC);

ALTER TABLE public.com_t_user_session_ticket_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own session ticket history" ON public.com_t_user_session_ticket_history FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);
-- @end-schema
