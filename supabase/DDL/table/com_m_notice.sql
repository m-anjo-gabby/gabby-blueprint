-- =========================================================================
-- com_m_notice: お知らせ
-- =========================================================================
-- 【配信先】
-- target_type が ALL（全生徒）・CLIENT（指定した顧客の生徒。client_id 必須）・COACH（全コーチ）。
-- RLS は target_type に加えて user_type（生徒='1' / コーチ='2'）でも絞り込み、生徒向けとコーチ向けの
-- お知らせが互いに見えないようにしている。
--
-- 【表示方法】
-- display_mode は POPUP（ホームを開いた時にポップアップ）・HOME（ホームのカード）・LIST（一覧のみ）。
-- 見出し画像（image_path）と行動ボタン（cta_label / cta_url）は生徒向けだけで使い、
-- コーチ向けは HOME・画像・ボタンを使えない（コーチアプリが未対応のため、CHECK 制約で防いでいる）。
-- =========================================================================

-- @schema public.com_m_notice
CREATE TABLE public.com_m_notice (
    notice_id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    target_type              character varying(10) NOT NULL DEFAULT 'ALL'::character varying,
    client_id                uuid         REFERENCES public.com_m_client(client_id) ON DELETE CASCADE,
    notice_type              character varying(20) NOT NULL DEFAULT 'INFO'::character varying,
    is_important             boolean      NOT NULL DEFAULT false,
    title                    text         NOT NULL,
    content                  text         NOT NULL,
    attachments              jsonb        NOT NULL DEFAULT '[]'::jsonb,
    published_at             timestamp with time zone NOT NULL,
    expired_at               timestamp with time zone,
    is_published             boolean      NOT NULL DEFAULT false,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    display_mode             character varying(10) NOT NULL DEFAULT 'LIST'::character varying,
    image_path               text,
    cta_label                text,
    cta_url                  text,
    CONSTRAINT chk_notice_coach_display CHECK (target_type::text <> 'COACH'::text OR display_mode::text <> 'HOME'::text AND image_path IS NULL AND cta_url IS NULL),
    CONSTRAINT chk_notice_cta CHECK ((cta_label IS NULL) = (cta_url IS NULL) AND (cta_label IS NULL OR char_length(cta_label) >= 1 AND char_length(cta_label) <= 30) AND (cta_url IS NULL OR cta_url ~ '^(/([^/]|$)|https://)'::text)),
    CONSTRAINT chk_notice_display_mode CHECK (display_mode::text = ANY (ARRAY['POPUP'::character varying, 'HOME'::character varying, 'LIST'::character varying]::text[])),
    CONSTRAINT chk_notice_target CHECK (target_type::text = 'ALL'::text AND client_id IS NULL OR target_type::text = 'CLIENT'::text AND client_id IS NOT NULL OR target_type::text = 'COACH'::text AND client_id IS NULL)
);

COMMENT ON TABLE public.com_m_notice IS 'お知らせマスタ';
COMMENT ON COLUMN public.com_m_notice.notice_id IS 'お知らせID';
COMMENT ON COLUMN public.com_m_notice.target_type IS '配信対象タイプ (ALL: 全体 / CLIENT: 顧客単位)';
COMMENT ON COLUMN public.com_m_notice.client_id IS '対象顧客ID (target_typeがCLIENTの場合に使用)';
COMMENT ON COLUMN public.com_m_notice.notice_type IS 'お知らせ種別 (INFO, CAMPAIGN, MAINTENANCE 等)';
COMMENT ON COLUMN public.com_m_notice.is_important IS '重要フラグ (重要バッジ表示用)';
COMMENT ON COLUMN public.com_m_notice.title IS 'タイトル';
COMMENT ON COLUMN public.com_m_notice.content IS '本文 (Markdown形式も想定)';
COMMENT ON COLUMN public.com_m_notice.attachments IS '添付ファイル情報 (JSONB形式)';
COMMENT ON COLUMN public.com_m_notice.published_at IS '公開開始日時 (JST入力→UTC保持)';
COMMENT ON COLUMN public.com_m_notice.expired_at IS '公開終了日時 (JST入力→UTC保持)';
COMMENT ON COLUMN public.com_m_notice.is_published IS '公開フラグ (TRUE: 公開中 / FALSE: 下書き等)';
COMMENT ON COLUMN public.com_m_notice.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_notice.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_notice.display_mode IS '表示方法 (POPUP: ホームを開いた時にポップアップ / HOME: ホームのカード（生徒のみ） / LIST: お知らせ一覧のみ)';
COMMENT ON COLUMN public.com_m_notice.image_path IS '見出し画像のStorageパス (notices バケット。生徒向けのみ)';
COMMENT ON COLUMN public.com_m_notice.cta_label IS '行動ボタンの文言 (生徒向けのみ。30文字まで)';
COMMENT ON COLUMN public.com_m_notice.cta_url IS '行動ボタンのリンク先 (アプリ内の /... または https://...)';

CREATE INDEX idx_notice_client ON public.com_m_notice (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_notice_fetch ON public.com_m_notice (is_published, published_at, expired_at);

ALTER TABLE public.com_m_notice ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view published notices for all or their client" ON public.com_m_notice FOR SELECT TO authenticated
USING (
    is_published = true AND published_at <= now() AND (expired_at IS NULL OR expired_at > now()) AND (target_type::text = 'ALL'::text AND public.get_jwt_user_type() = '1'::text OR target_type::text = 'CLIENT'::text AND public.get_jwt_user_type() = '1'::text AND client_id = public.get_jwt_client_id() OR target_type::text = 'COACH'::text AND public.get_jwt_user_type() = '2'::text)
);
-- @end-schema
