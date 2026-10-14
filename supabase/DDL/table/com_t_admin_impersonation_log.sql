-- =========================================================================
-- com_t_admin_impersonation_log: 管理者の代理ログインの監査ログ
-- =========================================================================
-- 障害対応・問い合わせの調査で、管理者が生徒としてマジックリンクで生徒ポータルにログインする「代理ログイン」の記録。
-- 生徒の画面には代理ログイン中であることを出さないため、いつ・どの管理者が・どの生徒に・どんな理由で行ったかをここだけに残す。
-- 読み書きとも service_role だけ（apps/admin のサーバーアクションと、apps/student の /auth/impersonate による redeemed_at の更新）。
-- authenticated には参照の権限も与えない。
-- =========================================================================

-- @schema public.com_t_admin_impersonation_log
CREATE TABLE public.com_t_admin_impersonation_log (
    impersonation_id         uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id                 uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
    target_user_id           uuid         REFERENCES public.com_m_user(id),
    reason                   text         NOT NULL,
    requested_at             timestamp with time zone NOT NULL DEFAULT now(),
    redeemed_at              timestamp with time zone,
    expires_at               timestamp with time zone
);

COMMENT ON TABLE public.com_t_admin_impersonation_log IS '管理者代理ログイン（対象生徒としてのログイン）監査ログ';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.admin_id IS '代理ログインを実行した管理者のUUID';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.target_user_id IS '代理ログイン対象の生徒のUUID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.reason IS '実行理由（チケット番号・問合せ内容等、入力必須）';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.requested_at IS 'マジックリンク発行日時';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.redeemed_at IS '生徒ポータル側でリンクが実際に消費され、セッションが確立した日時';
COMMENT ON COLUMN public.com_t_admin_impersonation_log.expires_at IS '代理セッションの失効予定日時（redeemed_at + 30分。以降はproxyが自動サインアウトさせる）';

CREATE INDEX idx_impersonation_log_admin ON public.com_t_admin_impersonation_log (admin_id, requested_at DESC);
CREATE INDEX idx_impersonation_log_target ON public.com_t_admin_impersonation_log (target_user_id, requested_at DESC);

ALTER TABLE public.com_t_admin_impersonation_log ENABLE ROW LEVEL SECURITY;
-- @end-schema
