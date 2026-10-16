-- =========================================================================
-- com_t_mail_outbox: メールの送信待ち・送信履歴
-- =========================================================================
-- 【役割】
-- 通知・リマインダーのメールは業務処理の中で直接送らず、ここに送信待ちとして登録し、
-- 送信処理（admin の /api/cron/mail-dispatch。本体は packages/lib/mail/dispatch/）がまとめて送る。
-- 業務処理がメールの失敗に巻き込まれず、再送・失敗の調査・送信履歴の確認ができる。
--
-- 【種別・区分】
-- mail_type（GROUP_SESSION_REMINDER 等）と category（NOTIFICATION / REMINDER 等）は CHECK 制約を持たない文字列で、
-- 値の正本は packages/lib/mail/dispatch/registry.ts（com_t_notification.notification_type と同じ方針）。
-- category は配信停止の設定（com_t_user_mail_setting）の単位。
--
-- 【重複防止】
-- (user_id, mail_type, dedup_key) で一意。リマインダーは「イベントID:24h」等を入れ、登録処理を何度実行しても1回だけ送る。
--
-- 【状態】
-- PENDING（送信待ち）→ SENDING（送信処理が確保中）→ SENT（送信済み）/ SKIPPED（送らなかった。配信停止・予定の取消・
-- 開始済み等。理由は last_error）/ FAILED（再試行の上限に達した）。
-- 送信に失敗した行は attempts を加算して PENDING に戻し、次回に再試行する。SENDING のまま一定時間経った行
-- （送信処理の異常終了）は、次回の確保時に再度対象にする（claim_mail_outbox）。
-- 送信後の到達状況（届いた・届かなかった・迷惑メールの報告等）は Resend の Webhook（admin の /api/webhooks/resend）が
-- record_mail_event で delivery_status に記録する（出来事の一覧は com_t_mail_event）。status は送信処理の状態のまま変えない。
--
-- 【参照できる範囲】
-- RLS を有効にしてポリシーを作らない（service_role の送信処理と SECURITY DEFINER の関数だけが読み書きする）。
-- =========================================================================

-- @schema public.com_t_mail_outbox
CREATE TABLE public.com_t_mail_outbox (
    mail_id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    mail_type                character varying(50) NOT NULL,
    category                 character varying(30) NOT NULL,
    dedup_key                character varying(255) NOT NULL,
    payload                  jsonb        NOT NULL DEFAULT '{}'::jsonb,
    status                   character varying(10) NOT NULL DEFAULT 'PENDING'::character varying,
    scheduled_at             timestamp with time zone NOT NULL DEFAULT now(),
    attempts                 integer      NOT NULL DEFAULT 0,
    locked_at                timestamp with time zone,
    last_error               text,
    provider_message_id      text,
    sent_at                  timestamp with time zone,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    delivery_status          character varying(20),
    delivery_detail          text,
    delivery_updated_at      timestamp with time zone,
    CONSTRAINT com_t_mail_outbox_user_id_mail_type_dedup_key_key UNIQUE (user_id, mail_type, dedup_key),
    CONSTRAINT chk_mail_outbox_delivery_status CHECK (delivery_status::text = ANY (ARRAY['DELAYED'::character varying, 'DELIVERED'::character varying, 'BOUNCED'::character varying, 'FAILED'::character varying, 'SUPPRESSED'::character varying, 'COMPLAINED'::character varying]::text[])),
    CONSTRAINT chk_mail_outbox_status CHECK (status::text = ANY (ARRAY['PENDING'::character varying, 'SENDING'::character varying, 'SENT'::character varying, 'SKIPPED'::character varying, 'FAILED'::character varying]::text[]))
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
COMMENT ON COLUMN public.com_t_mail_outbox.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_mail_outbox.update_date IS '更新日時';
COMMENT ON COLUMN public.com_t_mail_outbox.delivery_status IS '到達状況 (Resend の Webhook。DELAYED: 遅延 / DELIVERED: 到達 / BOUNCED: 不達 / FAILED: 送信失敗 / SUPPRESSED: 送信停止中の宛先 / COMPLAINED: 迷惑メールの報告)';
COMMENT ON COLUMN public.com_t_mail_outbox.delivery_detail IS '到達状況の詳細（不達の理由等）';
COMMENT ON COLUMN public.com_t_mail_outbox.delivery_updated_at IS '到達状況の更新日時';

CREATE INDEX idx_mail_outbox_pending ON public.com_t_mail_outbox (scheduled_at) WHERE status::text = ANY (ARRAY['PENDING'::character varying, 'SENDING'::character varying]::text[]);
CREATE INDEX idx_mail_outbox_provider_message ON public.com_t_mail_outbox (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_mail_outbox_user ON public.com_t_mail_outbox (user_id, insert_date DESC);

CREATE TRIGGER trg_mail_outbox_dispatch AFTER INSERT ON public.com_t_mail_outbox REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.on_mail_outbox_inserted();

ALTER TABLE public.com_t_mail_outbox ENABLE ROW LEVEL SECURITY;
-- @end-schema
