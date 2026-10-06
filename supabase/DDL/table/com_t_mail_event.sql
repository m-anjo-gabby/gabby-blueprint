---------------------------------------------
-- DDL: com_t_mail_event (メールの到達状況の出来事) (2026-10-06 追加)
---------------------------------------------
-- 【背景】
-- Resend の Webhook（admin の /api/webhooks/resend）で届く出来事（送信・到達・遅延・不達・迷惑メールの報告等）を記録する。
-- 送信待ち（com_t_mail_outbox）を通らない招待・パスワード再設定のメールも記録するため、
-- 「メールが届かない」という問い合わせを、宛先のアドレスで調べられる。
-- 送信待ちを通ったメールは、mail_id（送信時に Resend のタグで付けた送信待ちの行）で送信待ちの行と結び付き、
-- record_mail_event が送信待ちの行の到達状況（delivery_status）も更新する。
--
-- 【重複】
-- Webhook は同じ出来事を再送しうるため、webhook_id（Resend の svix-id ヘッダー）で一意にする。
--
-- 【保管期限】
-- 送信待ちと同じく、purge_mail_history（pg_cron の毎日のジョブ）が一定期間を過ぎた行を消す。
--
-- 生徒・コーチ・管理者の画面からは参照しない（RLSを有効にしてポリシーを作らない＝service_roleのみ）。
---------------------------------------------
CREATE TABLE public.com_t_mail_event (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id VARCHAR(100) NOT NULL UNIQUE,
    event_type VARCHAR(40) NOT NULL,
    provider_message_id VARCHAR(100) NOT NULL,
    mail_id UUID,
    mail_kind VARCHAR(50),
    recipient TEXT,
    subject TEXT,
    detail TEXT,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_mail_event IS 'メールの到達状況の出来事（Resend の Webhook。招待・パスワード再設定を含むすべてのメール）';
COMMENT ON COLUMN public.com_t_mail_event.event_id IS '出来事ID';
COMMENT ON COLUMN public.com_t_mail_event.webhook_id IS 'Webhook の配信ID（svix-id。同じ出来事の再送を1件にする）';
COMMENT ON COLUMN public.com_t_mail_event.event_type IS '出来事の種類 (email.sent / email.delivered / email.delivery_delayed / email.bounced / email.complained / email.failed / email.suppressed)';
COMMENT ON COLUMN public.com_t_mail_event.provider_message_id IS '送信サービス(Resend)のメッセージID';
COMMENT ON COLUMN public.com_t_mail_event.mail_id IS '送信待ちの行 (com_t_mail_outbox.mail_id。送信待ちを通らないメールは NULL。送信待ちの行が消えても残すため外部キーにしない)';
COMMENT ON COLUMN public.com_t_mail_event.mail_kind IS 'メールの種類（送信時の Resend のタグ kind。例: account_invite_student / password_reset / NOTIFICATION）';
COMMENT ON COLUMN public.com_t_mail_event.recipient IS '宛先のメールアドレス';
COMMENT ON COLUMN public.com_t_mail_event.subject IS '件名';
COMMENT ON COLUMN public.com_t_mail_event.detail IS '詳細（不達・送信失敗の理由等）';
COMMENT ON COLUMN public.com_t_mail_event.occurred_at IS '出来事の日時（Resend が記録した日時）';
COMMENT ON COLUMN public.com_t_mail_event.insert_date IS '登録日時';

CREATE INDEX idx_mail_event_message ON public.com_t_mail_event (provider_message_id);
CREATE INDEX idx_mail_event_recipient ON public.com_t_mail_event (lower(recipient), occurred_at DESC);
CREATE INDEX idx_mail_event_occurred ON public.com_t_mail_event (occurred_at DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
-- ポリシーを作らない（service_role の Webhook の受け口と SECURITY DEFINER 関数だけが読み書きする）
---------------------------------------------
ALTER TABLE public.com_t_mail_event ENABLE ROW LEVEL SECURITY;
