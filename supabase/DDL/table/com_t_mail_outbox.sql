---------------------------------------------
-- DDL: com_t_mail_outbox (メール送信待ち・送信履歴) (2026-10-05 追加)
---------------------------------------------
-- 【背景】
-- 通知・リマインダーのメールを、業務処理の中で直接送らず「送信待ち」として記録してから
-- 送信処理（admin の /api/cron/mail-dispatch。本体は packages/lib/mail/dispatch/）がまとめて送る。
-- 業務処理がメールの失敗に巻き込まれず、再送・失敗の調査・送信履歴の確認ができる。
--
-- 【種別・区分】
-- mail_type（GROUP_SESSION_REMINDER 等）と category（NOTIFICATION / REMINDER 等）は
-- CHECK制約を持たないフリーテキストとし、値の正本は packages/lib/mail/dispatch/registry.ts
-- （com_t_notification.notification_type と同じ方針）。category は配信停止の設定
-- （com_t_user_mail_setting）の単位。
--
-- 【重複防止】
-- (user_id, mail_type, dedup_key) で一意。リマインダーは「イベントID:24h」等を入れ、
-- 登録処理を何度実行しても1回しか送らない。
--
-- 【状態】
-- PENDING（送信待ち）→ SENDING（送信処理が確保中）→ SENT（送信済み）/ SKIPPED（送らなかった。
-- 配信停止・予定の取消・開始済み等。理由は last_error）/ FAILED（再試行の上限に達した）。
-- 送信に失敗した行は attempts を加算して PENDING に戻し、次回の送信処理で再試行する。
-- SENDING のまま一定時間経った行（送信処理の異常終了）は、次回の確保時に再度対象にする（claim_mail_outbox）。
--
-- 【到達状況 (2026-10-06 追加)】
-- 送信後の到達状況（届いた・届かなかった・迷惑メールの報告等）は、Resend の Webhook（admin の /api/webhooks/resend）が
-- record_mail_event で delivery_status に記録する（出来事の一覧は com_t_mail_event）。status は送信処理の状態のまま変えない。
--
-- 生徒・コーチ・管理者の画面からは参照しない（RLSを有効にしてポリシーを作らない＝service_roleのみ）。
---------------------------------------------
CREATE TABLE public.com_t_mail_outbox (
    mail_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    mail_type VARCHAR(50) NOT NULL,
    category VARCHAR(30) NOT NULL,
    dedup_key VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    provider_message_id TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivery_status VARCHAR(20),
    delivery_detail TEXT,
    delivery_updated_at TIMESTAMP WITH TIME ZONE,
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_mail_outbox_status CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'SKIPPED', 'FAILED')),
    CONSTRAINT chk_mail_outbox_delivery_status CHECK (delivery_status IN ('DELAYED', 'DELIVERED', 'BOUNCED', 'FAILED', 'SUPPRESSED', 'COMPLAINED')),
    UNIQUE (user_id, mail_type, dedup_key)
);

COMMENT ON TABLE public.com_t_mail_outbox IS 'メール送信待ち・送信履歴（通知・リマインダーのメール。送信は送信処理がまとめて行う）';
COMMENT ON COLUMN public.com_t_mail_outbox.mail_id IS 'メールID';
COMMENT ON COLUMN public.com_t_mail_outbox.user_id IS '宛先ユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_mail_outbox.mail_type IS 'メール種別 (例: GROUP_SESSION_REMINDER)。正本は packages/lib/mail/dispatch/registry.ts';
COMMENT ON COLUMN public.com_t_mail_outbox.category IS '配信区分 (NOTIFICATION / REMINDER 等)。配信停止の設定(com_t_user_mail_setting)の単位';
COMMENT ON COLUMN public.com_t_mail_outbox.dedup_key IS '重複防止キー（同一の宛先・種別で一意。例: <calendar_event_id>:24h）';
COMMENT ON COLUMN public.com_t_mail_outbox.payload IS '文面の組み立てに必要なパラメータ (JSONB、種別ごとに内容が異なる。表示内容は送信時に最新の業務データから組み立てる)';
COMMENT ON COLUMN public.com_t_mail_outbox.status IS '状態 (PENDING: 送信待ち / SENDING: 送信処理が確保中 / SENT: 送信済み / SKIPPED: 送らなかった / FAILED: 再試行の上限に達した)';
COMMENT ON COLUMN public.com_t_mail_outbox.scheduled_at IS '送信予定日時（この日時以降に送る）';
COMMENT ON COLUMN public.com_t_mail_outbox.attempts IS '送信の試行回数';
COMMENT ON COLUMN public.com_t_mail_outbox.locked_at IS '送信処理が確保した日時（SENDING の間）';
COMMENT ON COLUMN public.com_t_mail_outbox.last_error IS '直近の失敗内容、または送らなかった理由';
COMMENT ON COLUMN public.com_t_mail_outbox.provider_message_id IS '送信サービス(Resend)のメッセージID';
COMMENT ON COLUMN public.com_t_mail_outbox.sent_at IS '送信日時';
COMMENT ON COLUMN public.com_t_mail_outbox.delivery_status IS '到達状況 (Resend の Webhook。DELAYED: 遅延 / DELIVERED: 到達 / BOUNCED: 不達 / FAILED: 送信失敗 / SUPPRESSED: 送信停止中の宛先 / COMPLAINED: 迷惑メールの報告)';
COMMENT ON COLUMN public.com_t_mail_outbox.delivery_detail IS '到達状況の詳細（不達の理由等）';
COMMENT ON COLUMN public.com_t_mail_outbox.delivery_updated_at IS '到達状況の更新日時';
COMMENT ON COLUMN public.com_t_mail_outbox.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_mail_outbox.update_date IS '更新日時';

CREATE INDEX idx_mail_outbox_pending ON public.com_t_mail_outbox (scheduled_at) WHERE status IN ('PENDING', 'SENDING');
CREATE INDEX idx_mail_outbox_user ON public.com_t_mail_outbox (user_id, insert_date DESC);
CREATE INDEX idx_mail_outbox_provider_message ON public.com_t_mail_outbox (provider_message_id) WHERE provider_message_id IS NOT NULL;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
-- ポリシーを作らない（service_role の送信処理と SECURITY DEFINER 関数だけが読み書きする）
---------------------------------------------
ALTER TABLE public.com_t_mail_outbox ENABLE ROW LEVEL SECURITY;
