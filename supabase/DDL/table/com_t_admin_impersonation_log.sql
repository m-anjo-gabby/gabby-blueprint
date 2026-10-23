-- =========================================================================
-- com_t_admin_impersonation_log: 管理者の代理ログインの監査ログ
-- =========================================================================
-- 障害対応・問い合わせの調査で、管理者が生徒・コーチとしてマジックリンクで各ポータルにログインする「代理ログイン」の記録。
-- 本人の画面には代理ログイン中であることを出さないため、いつ・どの管理者が・誰に・どんな理由で行ったかをここだけに残す。
-- 代理ログインに期限は無く、管理者が代理ログイン先でログアウトするまで続く（終わりの日時は持たない。運用の手順で守る）。
-- 読み書きとも service_role だけ（apps/admin のサーバーアクションと、apps/{student,coach} の /auth/impersonate による
-- redeemed_at の更新）。authenticated には参照の権限も与えない。
-- 監査の記録のため、退会・顧客単位の一括削除でも行を残す（対象・管理者の外部キーは SET NULL。docs/DATA-DELETION.md）。
-- 理由（reason）は自由記述のため、画面で氏名・メールアドレスを書かないよう案内する。
-- =========================================================================

-- @schema public.com_t_admin_impersonation_log
CREATE TABLE public.com_t_admin_impersonation_log (
    impersonation_id         uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id                 uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
    target_user_id           uuid         REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    reason                   text         NOT NULL,
    requested_at             timestamp with time zone NOT NULL DEFAULT now(),
    redeemed_at              timestamp with time zone
);

COMMENT ON TABLE public.com_t_admin_impersonation_log IS '管理者の代理ログイン（対象の生徒・コーチとしてのログイン）の監査ログ';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.admin_id IS '代理ログインを実行した管理者のUUID';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.target_user_id IS '代理ログインの対象の生徒・コーチのUUID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.reason IS '実行理由（チケット番号・問合せ内容等、入力必須）';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.requested_at IS 'マジックリンク発行日時';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.redeemed_at IS '生徒・コーチのポータルでリンクが使われ、セッションができた日時';

CREATE INDEX idx_impersonation_log_admin ON public.com_t_admin_impersonation_log (admin_id, requested_at DESC);
CREATE INDEX idx_impersonation_log_target ON public.com_t_admin_impersonation_log (target_user_id, requested_at DESC);

ALTER TABLE public.com_t_admin_impersonation_log ENABLE ROW LEVEL SECURITY;
-- @end-schema
