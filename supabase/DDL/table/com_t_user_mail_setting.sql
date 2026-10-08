---------------------------------------------
-- DDL: com_t_user_mail_setting (メール配信設定) (2026-10-05 追加)
---------------------------------------------
-- 【背景】
-- 通知・リマインダーのメールを、利用者が区分ごとに停止できるようにする。
-- 行が無い区分は「配信する」として扱う（初期値オン。停止・再開した区分だけ行を持つ）。
-- 区分（category）の値の正本は packages/lib/mail/dispatch/registry.ts の MAIL_CATEGORIES。
-- アカウント関連（招待・パスワード再設定）は停止できないため、本テーブルの対象外。
-- 停止してもアプリ内の通知（com_t_notification）は届く。
---------------------------------------------
CREATE TABLE public.com_t_user_mail_setting (
    user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    category VARCHAR(30) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, category)
);

COMMENT ON TABLE public.com_t_user_mail_setting IS 'メール配信設定（区分ごとの配信・停止。行が無い区分は配信する）';
COMMENT ON COLUMN public.com_t_user_mail_setting.user_id IS 'ユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_user_mail_setting.category IS '配信区分 (NOTIFICATION / REMINDER 等)。正本は packages/lib/mail/dispatch/registry.ts';
COMMENT ON COLUMN public.com_t_user_mail_setting.enabled IS '配信する (TRUE: 配信 / FALSE: 停止)';
COMMENT ON COLUMN public.com_t_user_mail_setting.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_mail_setting.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
-- 本人の行だけを参照・登録・更新できる（プロフィール画面のサーバーアクションから更新する）
---------------------------------------------
ALTER TABLE public.com_t_user_mail_setting ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own mail settings" ON public.com_t_user_mail_setting;
DROP POLICY IF EXISTS "Users can insert their own mail settings" ON public.com_t_user_mail_setting;
DROP POLICY IF EXISTS "Users can update their own mail settings" ON public.com_t_user_mail_setting;

CREATE POLICY "Users can view their own mail settings" ON public.com_t_user_mail_setting
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own mail settings" ON public.com_t_user_mail_setting
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own mail settings" ON public.com_t_user_mail_setting
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
