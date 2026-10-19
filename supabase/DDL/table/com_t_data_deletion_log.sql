-- =========================================================================
-- com_t_data_deletion_log: 退会・顧客単位の一括削除の記録
-- =========================================================================
-- 戻せない削除（docs/DATA-DELETION.md の C・D）を、誰が・いつ・何を・何件消したかだけを残す。
-- 氏名・メールアドレス等の個人情報は持たない（退会の記録に個人情報が残ると、消去の意味が無くなるため）。
-- 書き込みは fn_withdraw_user / fn_purge_client だけ。参照・更新とも service_role だけ（ポリシーは作らない）。
-- =========================================================================

-- @schema public.com_t_data_deletion_log
CREATE TABLE public.com_t_data_deletion_log (
    log_id                   uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    kind                     text         NOT NULL,
    target_id                uuid         NOT NULL,
    counts                   jsonb        NOT NULL DEFAULT '{}'::jsonb,
    performed_by             uuid         REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    performed_at             timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_data_deletion_log_kind CHECK (kind = ANY (ARRAY['withdraw_user'::text, 'purge_client'::text]))
);

COMMENT ON TABLE public.com_t_data_deletion_log IS '退会・顧客単位の一括削除の記録（氏名・メールアドレスは持たない）';
COMMENT ON COLUMN public.com_t_data_deletion_log.kind IS '種類 withdraw_user:退会（個人情報の消去） purge_client:顧客単位の一括削除';
COMMENT ON COLUMN public.com_t_data_deletion_log.target_id IS '対象のID（withdraw_user: com_m_user.id。退会済みの行として残る / purge_client: 削除した com_m_client.client_id）';
COMMENT ON COLUMN public.com_t_data_deletion_log.counts IS '消した件数（種類ごと）';
COMMENT ON COLUMN public.com_t_data_deletion_log.performed_by IS '実行した管理者（com_m_user.id）';
COMMENT ON COLUMN public.com_t_data_deletion_log.performed_at IS '実行日時';

CREATE INDEX idx_data_deletion_log_performed_at ON public.com_t_data_deletion_log (performed_at DESC);

ALTER TABLE public.com_t_data_deletion_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.com_t_data_deletion_log FROM anon;
REVOKE ALL ON public.com_t_data_deletion_log FROM authenticated;
-- @end-schema
