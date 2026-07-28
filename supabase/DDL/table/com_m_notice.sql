---------------------------------------------
-- DDL: com_m_notice (お知らせマスタ)
---------------------------------------------
CREATE TABLE public.com_m_notice (
    notice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(10) NOT NULL DEFAULT 'ALL', -- 'ALL': 全体, 'CLIENT': 顧客指定
    client_id UUID REFERENCES public.com_m_client(client_id) ON DELETE CASCADE,
    notice_type VARCHAR(20) NOT NULL DEFAULT 'INFO', -- 'INFO', 'CAMPAIGN', 'MAINTENANCE', etc.
    is_important BOOLEAN NOT NULL DEFAULT FALSE, -- 重要度バッジ用
    show_dialog BOOLEAN NOT NULL DEFAULT FALSE,  -- ダイアログ（ポップアップ）表示制御
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb, -- Supabase Storage添付情報 [{path, name, size, mime_type}]
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expired_at TIMESTAMP WITH TIME ZONE,            -- NULL許容（無期限の場合）
    is_published BOOLEAN NOT NULL DEFAULT FALSE,    -- 下書き/公開状態の制御
    delete_flg TEXT NOT NULL DEFAULT '0',
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- target_typeが'CLIENT'の場合はclient_idを必須とする制約
    CONSTRAINT chk_notice_target CHECK (
        (target_type = 'ALL' AND client_id IS NULL) OR 
        (target_type = 'CLIENT' AND client_id IS NOT NULL)
    )
);

COMMENT ON TABLE public.com_m_notice IS 'お知らせマスタ';
COMMENT ON COLUMN public.com_m_notice.notice_id IS 'お知らせID';
COMMENT ON COLUMN public.com_m_notice.target_type IS '配信対象タイプ (ALL: 全体 / CLIENT: 顧客単位)';
COMMENT ON COLUMN public.com_m_notice.client_id IS '対象顧客ID (target_typeがCLIENTの場合に使用)';
COMMENT ON COLUMN public.com_m_notice.notice_type IS 'お知らせ種別 (INFO, CAMPAIGN, MAINTENANCE 等)';
COMMENT ON COLUMN public.com_m_notice.is_important IS '重要フラグ (重要バッジ表示用)';
COMMENT ON COLUMN public.com_m_notice.show_dialog IS 'ポップアップ表示フラグ (ダッシュボードでの表示制御)';
COMMENT ON COLUMN public.com_m_notice.title IS 'タイトル';
COMMENT ON COLUMN public.com_m_notice.content IS '本文 (Markdown形式も想定)';
COMMENT ON COLUMN public.com_m_notice.attachments IS '添付ファイル情報 (JSONB形式)';
COMMENT ON COLUMN public.com_m_notice.published_at IS '公開開始日時 (JST入力→UTC保持)';
COMMENT ON COLUMN public.com_m_notice.expired_at IS '公開終了日時 (JST入力→UTC保持)';
COMMENT ON COLUMN public.com_m_notice.is_published IS '公開フラグ (TRUE: 公開中 / FALSE: 下書き等)';
COMMENT ON COLUMN public.com_m_notice.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_notice.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_notice.update_date IS '更新日時';

-- パフォーマンス向上のためのインデックス設定
CREATE INDEX idx_notice_fetch ON public.com_m_notice (is_published, delete_flg, published_at, expired_at);
CREATE INDEX idx_notice_client ON public.com_m_notice (client_id) WHERE client_id IS NOT NULL;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_notice ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view published notices for all or their client" ON public.com_m_notice;

CREATE POLICY "Users can view published notices for all or their client" ON public.com_m_notice
FOR SELECT TO authenticated USING (
    is_published = TRUE
    AND delete_flg = '0'
    AND published_at <= NOW()
    AND (expired_at IS NULL OR expired_at > NOW())
    AND (
        target_type = 'ALL'
        OR (target_type = 'CLIENT' AND client_id = public.get_jwt_client_id())
    )
);