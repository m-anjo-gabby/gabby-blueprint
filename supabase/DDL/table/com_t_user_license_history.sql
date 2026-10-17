-- =========================================================================
-- com_t_user_license_history: ライセンスの変更履歴（監査ログ）
-- =========================================================================
-- com_t_user_license は解除時に行を削除するため、割り当て・変更・無効化・解除のたびにその時点の内容（ダイアログプラクティスの
-- 利用可否を含む）をここに追記して残す。assigned は割当後、updated / invalidated / removed は操作前の内容を記録する。
-- 書き込みはアプリ（packages/lib/license/issue.ts の recordLicenseHistory）が行い、無効化の RPC（invalidate_user_license）自体は書かない。
-- 解除後は参照先が無くなるため license_id に外部キーは張らない。
-- 書き込みは service_role だけ。参照の範囲は com_t_user_license と同じ。
-- =========================================================================

-- @schema public.com_t_user_license_history
CREATE TABLE public.com_t_user_license_history (
    history_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    license_id               uuid         NOT NULL,
    contract_id              uuid         REFERENCES public.com_m_contract(contract_id) ON DELETE RESTRICT,
    user_id                  uuid         REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    action                   text         NOT NULL,
    status                   smallint     NOT NULL,
    start_date               timestamp with time zone NOT NULL,
    end_date                 timestamp with time zone NOT NULL,
    note                     text,
    performed_by             uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_at             timestamp with time zone NOT NULL DEFAULT now(),
    has_dialogue_practice    boolean      NOT NULL DEFAULT false,
    CONSTRAINT com_t_user_license_history_action_check CHECK (action = ANY (ARRAY['assigned'::text, 'updated'::text, 'invalidated'::text, 'removed'::text]))
);

COMMENT ON TABLE public.com_t_user_license_history IS 'ライセンス変更履歴（割当・更新・無効化・解除の追記専用ログ）';
COMMENT ON COLUMN public.com_t_user_license_history.license_id IS '対象のライセンスID（com_t_user_license, FKなし）';
COMMENT ON COLUMN public.com_t_user_license_history.action IS '操作種別 assigned:割当 / updated:更新(更新前スナップショット) / invalidated:無効化(無効化前スナップショット) / removed:解除(解除前スナップショット)';
COMMENT ON COLUMN public.com_t_user_license_history.status IS '記録時点でのステータス';
COMMENT ON COLUMN public.com_t_user_license_history.performed_by IS '操作を行った管理者のUUID（不明時はNULL）';
COMMENT ON COLUMN public.com_t_user_license_history.performed_at IS '操作日時';
COMMENT ON COLUMN public.com_t_user_license_history.has_dialogue_practice IS '記録時点でのダイアログプラクティス利用可否';

CREATE INDEX idx_license_history_contract ON public.com_t_user_license_history (contract_id, performed_at DESC);
CREATE INDEX idx_license_history_user ON public.com_t_user_license_history (user_id, performed_at DESC);

ALTER TABLE public.com_t_user_license_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own license history" ON public.com_t_user_license_history FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);
-- @end-schema
