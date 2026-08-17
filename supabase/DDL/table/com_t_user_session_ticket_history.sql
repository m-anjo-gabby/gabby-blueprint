---------------------------------------------
-- DDL: com_t_user_session_ticket_history (ライブセッションチケット変更履歴) (2026-08-13 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- com_t_user_session_ticket は com_t_user_license.license_id へのCASCADEで
-- 削除されうるため、com_t_user_license_history と同様に「いつ・誰が・何回分・
-- なぜチケットを発行/消化/復元/解除したか」を追記専用で残す監査ログ。
-- 特に、コーチ都合によるセッション不成立時のチケット復元（振替対応）や、
-- 今後実装する予約管理機能によるセッション実施完了時の消化を、
-- 透明性を持って追跡できるようにするための土台とする。
-- ticket_id には外部キー制約を設けていない（削除後は参照先が存在しなくなるため）。
---------------------------------------------
CREATE TABLE public.com_t_user_session_ticket_history (
    history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL,              -- com_t_user_session_ticket.ticket_id（削除後は非存在になり得るためFKなし）
    contract_id uuid REFERENCES public.com_m_contract(contract_id),
    user_id uuid REFERENCES public.com_m_user(id),
    action text NOT NULL CHECK (action IN ('granted', 'consumed', 'restored', 'removed')),
    sessions_delta smallint NOT NULL,     -- 変動量（granted/restored: 正の値, consumed: 負の値, removedは0でスナップショットのみ）
    used_sessions_after smallint NOT NULL, -- 記録時点の消化済み数
    total_sessions smallint NOT NULL,      -- 記録時点の総チケット数
    note text DEFAULT NULL,               -- コーチ都合キャンセルの振替理由等
    performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- 操作を行った管理者（将来的に予約管理機能からの自動記録も想定）
    performed_at timestamp with time zone NOT NULL DEFAULT NOW()
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

CREATE INDEX idx_session_ticket_history_user ON public.com_t_user_session_ticket_history (user_id, performed_at DESC);
CREATE INDEX idx_session_ticket_history_contract ON public.com_t_user_session_ticket_history (contract_id, performed_at DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_user_session_ticket_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant session ticket history" ON public.com_t_user_session_ticket_history;

-- 参照権限のみ付与（既存の com_t_user_session_ticket と同じ範囲）。書き込みは常にservice_role経由。
CREATE POLICY "Users can view relevant session ticket history" ON public.com_t_user_session_ticket_history
FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR
    contract_id IN (
        SELECT contract_id FROM public.com_m_contract
        WHERE client_id = public.get_jwt_client_id()
    )
);
