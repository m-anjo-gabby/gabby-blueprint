---------------------------------------------
-- DDL: com_t_user_license_history (ライセンス変更履歴) (2026-08-06 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- com_t_user_license は解除時に物理削除(DELETE)される運用のため、「いつ・誰が・
-- どの期間のライセンスを・なぜ割当/変更/解除したか」という履歴が失われていた。
-- 本テーブルは変更のたびに追記専用でスナップショットを残すための監査ログであり、
-- com_t_user_license 自体の運用（割当・上限判定・解除でのDELETE）は一切変更しない。
-- そのため license_id には外部キー制約を設けていない（解除後は参照先が存在しなくなるため）。
---------------------------------------------
CREATE TABLE public.com_t_user_license_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL,             -- com_t_user_license.license_id（解除後は非存在になり得るためFKなし）
    contract_id UUID REFERENCES public.com_m_contract(contract_id),
    user_id UUID REFERENCES public.com_m_user(id),
    action TEXT NOT NULL CHECK (action IN ('assigned', 'updated', 'removed')),
    status SMALLINT NOT NULL,             -- 記録時点でのステータス
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    note TEXT DEFAULT NULL,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- 操作を行った管理者
    performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_user_license_history IS 'ライセンス変更履歴（割当・更新・解除の追記専用ログ）';
COMMENT ON COLUMN public.com_t_user_license_history.license_id IS '対象のライセンスID（com_t_user_license, FKなし）';
COMMENT ON COLUMN public.com_t_user_license_history.action IS '操作種別 assigned:割当 / updated:更新(更新前スナップショット) / removed:解除(解除前スナップショット)';
COMMENT ON COLUMN public.com_t_user_license_history.status IS '記録時点でのステータス';
COMMENT ON COLUMN public.com_t_user_license_history.performed_by IS '操作を行った管理者のUUID（不明時はNULL）';
COMMENT ON COLUMN public.com_t_user_license_history.performed_at IS '操作日時';

CREATE INDEX idx_license_history_user ON public.com_t_user_license_history (user_id, performed_at DESC);
CREATE INDEX idx_license_history_contract ON public.com_t_user_license_history (contract_id, performed_at DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_user_license_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant license history" ON public.com_t_user_license_history;

-- 参照権限のみ付与（既存の com_t_user_license と同じ範囲）。書き込みは常にservice_role経由。
CREATE POLICY "Users can view relevant license history" ON public.com_t_user_license_history
FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR
    contract_id IN (
        SELECT contract_id FROM public.com_m_contract
        WHERE client_id = public.get_jwt_client_id()
    )
);
