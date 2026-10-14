-- =========================================================================
-- com_t_user_mail_setting: メールの配信設定
-- =========================================================================
-- 通知・リマインダーのメールを、利用者が区分ごとに停止できる。行が無い区分は配信する（停止・再開した区分だけ行を持つ）。
-- 区分（category）の値の正本は packages/lib/mail/dispatch/registry.ts の MAIL_CATEGORIES。
-- アカウント関連（招待・パスワード再設定）は停止できないため対象外。停止してもアプリ内の通知（com_t_notification）は届く。
-- 本人の行だけを参照・登録・更新できる（プロフィール画面のサーバーアクションから更新する）。
-- =========================================================================

-- @schema public.com_t_user_mail_setting
CREATE TABLE public.com_t_user_mail_setting (
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    category                 character varying(30) NOT NULL,
    enabled                  boolean      NOT NULL DEFAULT true,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_user_mail_setting_pkey PRIMARY KEY (user_id, category)
);

COMMENT ON TABLE public.com_t_user_mail_setting IS 'メール配信設定（区分ごとの配信・停止。行が無い区分は配信する）';
COMMENT ON COLUMN public.com_t_user_mail_setting.user_id IS 'ユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_user_mail_setting.category IS '配信区分 (NOTIFICATION / REMINDER 等)。正本は packages/lib/mail/dispatch/registry.ts';
COMMENT ON COLUMN public.com_t_user_mail_setting.enabled IS '配信する (TRUE: 配信 / FALSE: 停止)';
COMMENT ON COLUMN public.com_t_user_mail_setting.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_mail_setting.update_date IS '更新日時';

ALTER TABLE public.com_t_user_mail_setting ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own mail settings" ON public.com_t_user_mail_setting FOR INSERT TO authenticated
WITH CHECK (
    user_id = auth.uid()
);

CREATE POLICY "Users can update their own mail settings" ON public.com_t_user_mail_setting FOR UPDATE TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);

CREATE POLICY "Users can view their own mail settings" ON public.com_t_user_mail_setting FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);
-- @end-schema
