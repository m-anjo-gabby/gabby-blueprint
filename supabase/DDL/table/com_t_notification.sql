-- =========================================================================
-- com_t_notification: 通知（個人宛のイベントの通知）
-- =========================================================================
-- 【役割】
-- システムが自動で出す個人宛の通知（チャットの新着・学習の達成等）。管理者が配信するお知らせ（com_m_notice）とは別。
-- notification_type は CHECK 制約やマスタで縛らない文字列で、表示のラベル・アイコン・遷移先は
-- packages/types/notification.ts の定数で管理する（種別の追加にスキーマの変更が要らないようにするため）。
--
-- 【集約（dedup_key）】
-- (user_id, notification_type, dedup_key) で一意。dedup_key が NULL の行は常に新しい行になる。
-- 達成系は固定の文字列を入れて ON CONFLICT DO NOTHING で1回だけ出す。チャットの新着等は room_id 等を入れて
-- ON CONFLICT DO UPDATE で同じキーの連続した発生を1行にまとめる（最新の内容・未読に更新する）。
--
-- 【書き込み・参照】
-- 登録は SECURITY DEFINER のトリガー関数だけが行う。本人は自分の行の参照と既読にする更新だけができる。
-- ベル・バッジのライブ更新のため Realtime の配信対象にしている。
-- =========================================================================

-- @schema public.com_t_notification
CREATE TABLE public.com_t_notification (
    notification_id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    notification_type        character varying(50) NOT NULL,
    dedup_key                character varying(255),
    payload                  jsonb        NOT NULL DEFAULT '{}'::jsonb,
    link_path                text,
    is_read                  boolean      NOT NULL DEFAULT false,
    read_at                  timestamp with time zone,
    occurred_at              timestamp with time zone NOT NULL DEFAULT now(),
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_notification_user_id_notification_type_dedup_key_key UNIQUE (user_id, notification_type, dedup_key)
);

COMMENT ON TABLE public.com_t_notification IS '通知（システムが自動発火する個人宛イベント通知。お知らせ(com_m_notice)とは別概念）';
COMMENT ON COLUMN public.com_t_notification.notification_id IS '通知ID';
COMMENT ON COLUMN public.com_t_notification.user_id IS '通知対象ユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_notification.notification_type IS '通知種別 (例: TRAINING_FIRST, TRAINING_STREAK, CHAT_NEW_MESSAGE)。表示定義はpackages/types/notification.tsで管理';
COMMENT ON COLUMN public.com_t_notification.dedup_key IS '集約キー。同一(user_id, notification_type, dedup_key)への再発生を1行に集約するために使用（NULL可、NULLは常に新規行）';
COMMENT ON COLUMN public.com_t_notification.payload IS '表示に必要なパラメータ (JSONB、通知種別ごとに内容が異なる)';
COMMENT ON COLUMN public.com_t_notification.link_path IS 'クリック時の遷移先（アプリ内相対パス）';
COMMENT ON COLUMN public.com_t_notification.is_read IS '既読フラグ';
COMMENT ON COLUMN public.com_t_notification.read_at IS '既読日時';
COMMENT ON COLUMN public.com_t_notification.occurred_at IS '最新発生日時（一覧のソート・表示用。集約UPSERT時に最新化される）';
COMMENT ON COLUMN public.com_t_notification.insert_date IS '登録日時（初回発生日時）';
COMMENT ON COLUMN public.com_t_notification.update_date IS '更新日時';

CREATE INDEX idx_notification_user_occurred ON public.com_t_notification (user_id, occurred_at DESC);
CREATE INDEX idx_notification_user_unread ON public.com_t_notification (user_id) WHERE is_read = false;

CREATE TRIGGER trg_notification_enqueue_mail AFTER INSERT OR UPDATE ON public.com_t_notification FOR EACH ROW EXECUTE FUNCTION private.enqueue_notification_mail();

ALTER TABLE public.com_t_notification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can mark their own notifications as read" ON public.com_t_notification FOR UPDATE TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);

CREATE POLICY "Users can view their own notifications" ON public.com_t_notification FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.com_t_notification;
-- @end-schema
