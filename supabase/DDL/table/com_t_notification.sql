---------------------------------------------
-- DDL: com_t_notification (通知)
---------------------------------------------
-- お知らせ(com_m_notice、管理者発信の一斉配信コンテンツ)とは異なり、
-- システムが自動発火する個人宛イベント通知（チャット新着・学習進捗の達成等）を保持する。
-- notification_type はDB側でCHECK制約やマスタテーブルによって縛らず自由なVARCHARとする。
-- 表示ラベル・アイコン・遷移先の組み立ては packages/types/notification.ts のTS側定数で
-- 一元管理し、新しい通知種別の追加がスキーマ変更（マイグレーション）を伴わないようにする。
CREATE TABLE public.com_t_notification (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  dedup_key VARCHAR(255),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  link_path TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- (user_id, notification_type, dedup_key) の組み合わせで集約する。
  -- dedup_key が NULL の行は一意制約の対象外となり常に新規行として扱われる。
  -- 達成系(進捗マイルストーン等)は固定文字列を設定しON CONFLICT DO NOTHINGで一度きりの発火を保証、
  -- フロー系(チャット新着等)は room_id 等を設定しON CONFLICT DO UPDATEで同一キー宛の連続発生を1行に集約する
  -- （例: チャットで連続送信されても通知が量産されず、最新内容・未読状態に更新されるのみとなる）。
  UNIQUE (user_id, notification_type, dedup_key)
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

CREATE INDEX idx_notification_user_unread ON public.com_t_notification (user_id) WHERE is_read = FALSE;
CREATE INDEX idx_notification_user_occurred ON public.com_t_notification (user_id, occurred_at DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_notification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.com_t_notification;
DROP POLICY IF EXISTS "Users can mark their own notifications as read" ON public.com_t_notification;

-- 参照は本人の行のみ
CREATE POLICY "Users can view their own notifications" ON public.com_t_notification
FOR SELECT TO authenticated USING (
    user_id = auth.uid()
);

-- 既読化のための更新も本人の行のみ（INSERTは許可しない。書き込みはSECURITY DEFINERのトリガー関数のみが行う）
CREATE POLICY "Users can mark their own notifications as read" ON public.com_t_notification
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

---------------------------------------------
-- Realtime購読対象への追加（ベル/バッジのライブ更新用）
---------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.com_t_notification;
