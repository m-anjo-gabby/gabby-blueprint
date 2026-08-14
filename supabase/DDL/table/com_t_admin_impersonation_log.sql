---------------------------------------------
-- DDL: com_t_admin_impersonation_log (管理者代理ログイン監査ログ) (2026-08-13 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- 障害対応・問合せ調査のため、管理者が対象の生徒としてマジックリンク経由で
-- 生徒ポータルにログインできる「代理ログイン」機能の監査ログ。
-- 生徒側UIには代理ログイン中である旨を一切表示しない運用のため、
-- 「いつ・どの管理者が・どの生徒に・どんな理由で」実行したかを本テーブルにのみ記録する。
-- 書き込みは常にservice_role経由（apps/admin の Server Action、および
-- apps/student の /auth/impersonate ルートによる redeemed_at 更新）。
---------------------------------------------
CREATE TABLE public.com_t_admin_impersonation_log (
    impersonation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- 代理ログインを実行した管理者
    target_user_id UUID REFERENCES public.com_m_user(id),        -- 代理ログイン対象の生徒
    reason TEXT NOT NULL,                                        -- 実行理由（チケット番号等、入力必須）
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), -- マジックリンク発行日時
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,            -- 生徒ポータル側でリンクが実際に消費された日時（未消費ならNULL）
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL              -- 代理セッションの失効予定日時（redeemed_at確定時に設定）
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

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_admin_impersonation_log ENABLE ROW LEVEL SECURITY;

-- 機微な監査情報のため、authenticated ロールへの参照権限は一切付与しない
-- （読み書きともに service_role 経由の管理者アクションからのみ許可する）
