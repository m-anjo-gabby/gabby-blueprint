---------------------------------------------
-- DDL: com_m_calendar_event (カレンダーイベントマスタ) (2026-08-19 追加)
---------------------------------------------
-- 【背景】
-- com_t_session（1:1ライブセッション、生徒・コーチ個人の予約実体）とは別に、
-- グループセッションやメンテナンス告知など「生徒/コーチ全体・特定顧客に配信する
-- 共有カレンダーイベント」を管理するマスタ。今後イベント種別が増える前提のため、
-- event_typeはCHECK制約を持たないフリーテキストとし、値の正本はアプリ側の型定義
-- （packages/types/calendarEvent.ts の CALENDAR_EVENT_TYPES）とする
-- （com_m_notice.notice_type と同じ方針）。
--
-- グループセッションの参加者管理（定員・申込・キャンセル待ち）は対象外。
-- 本テーブルは「いつ・何が・どこで（任意）」を表示するための情報のみを持つ。
---------------------------------------------
CREATE TABLE public.com_m_calendar_event (
    calendar_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(30) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE,
    location_url TEXT,
    target_type VARCHAR(10) NOT NULL DEFAULT 'ALL',
    client_id UUID REFERENCES public.com_m_client(client_id) ON DELETE CASCADE,
    rsvp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    delete_flg TEXT NOT NULL DEFAULT '0',
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_calendar_event_time_range CHECK (end_datetime IS NULL OR end_datetime > start_datetime),
    CONSTRAINT chk_calendar_event_target CHECK (
        (target_type = 'ALL' AND client_id IS NULL) OR
        (target_type = 'CLIENT' AND client_id IS NOT NULL) OR
        (target_type = 'COACH' AND client_id IS NULL)
    )
);

COMMENT ON TABLE public.com_m_calendar_event IS 'カレンダーイベントマスタ（グループセッション・メンテナンス告知等、共有配信するカレンダーイベント）';
COMMENT ON COLUMN public.com_m_calendar_event.calendar_event_id IS 'カレンダーイベントID';
COMMENT ON COLUMN public.com_m_calendar_event.event_type IS 'イベント種別 (GROUP_SESSION, MAINTENANCE 等。今後追加される想定のためフリーテキストで保持。正本はアプリ側の型定義)';
COMMENT ON COLUMN public.com_m_calendar_event.title IS 'タイトル';
COMMENT ON COLUMN public.com_m_calendar_event.description IS '説明（任意）';
COMMENT ON COLUMN public.com_m_calendar_event.start_datetime IS '開始日時（UTC格納）';
COMMENT ON COLUMN public.com_m_calendar_event.end_datetime IS '終了日時（UTC格納、NULL許容: 終了時刻を持たない告知を許容）';
COMMENT ON COLUMN public.com_m_calendar_event.location_url IS '参加URL（Zoom等、主にグループセッション用、任意）';
COMMENT ON COLUMN public.com_m_calendar_event.target_type IS '配信対象タイプ (ALL: 生徒全体 / CLIENT: 顧客単位 / COACH: コーチ全体)';
COMMENT ON COLUMN public.com_m_calendar_event.client_id IS '対象顧客ID (target_typeがCLIENTの場合に使用)';
COMMENT ON COLUMN public.com_m_calendar_event.rsvp_enabled IS '参加確認フラグ (TRUE: 生徒/コーチが参加登録・キャンセルできる / FALSE: 参加確認機能を使わない告知)';
COMMENT ON COLUMN public.com_m_calendar_event.is_published IS '公開フラグ (TRUE: 公開中 / FALSE: 下書き)';
COMMENT ON COLUMN public.com_m_calendar_event.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_calendar_event.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_calendar_event.update_date IS '更新日時';

CREATE INDEX idx_calendar_event_fetch ON public.com_m_calendar_event (is_published, delete_flg, start_datetime);
CREATE INDEX idx_calendar_event_type ON public.com_m_calendar_event (event_type);
CREATE INDEX idx_calendar_event_client ON public.com_m_calendar_event (client_id) WHERE client_id IS NOT NULL;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_calendar_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage calendar events" ON public.com_m_calendar_event;
DROP POLICY IF EXISTS "Users can view published calendar events" ON public.com_m_calendar_event;

-- 管理者はフル操作可（com_m_ai_knowledge_baseと同一パターン）
CREATE POLICY "Admin can manage calendar events" ON public.com_m_calendar_event
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

-- 生徒/コーチは公開済み・自分向けのイベントのみ閲覧可（com_m_noticeと同一パターン）
CREATE POLICY "Users can view published calendar events" ON public.com_m_calendar_event
FOR SELECT TO authenticated USING (
    is_published = TRUE
    AND delete_flg = '0'
    AND (
        (target_type = 'ALL' AND public.get_jwt_user_type() = '1')
        OR (target_type = 'CLIENT' AND public.get_jwt_user_type() = '1' AND client_id = public.get_jwt_client_id())
        OR (target_type = 'COACH' AND public.get_jwt_user_type() = '2')
    )
);

---------------------------------------------
-- 追加パッチ: グループセッション担当コーチ対応 (2026-08-25)
-- 既存環境に対しては、このDROP POLICY/CREATE POLICY文のみをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_calendar_event_coach.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- グループセッションに担当コーチ（com_t_calendar_event_coach）を割り当てられるようにした。
-- target_type='ALL'（生徒全体配信）のイベントは本来コーチには非公開だが、
-- 担当コーチとして割り当てられている場合に限り、そのイベント本体を閲覧できるようにする
-- （既存の可視範囲を狭めない追加のOR条件のため、他ロールへの影響は無い）。
---------------------------------------------
DROP POLICY IF EXISTS "Users can view published calendar events" ON public.com_m_calendar_event;
CREATE POLICY "Users can view published calendar events" ON public.com_m_calendar_event
FOR SELECT TO authenticated USING (
    is_published = TRUE
    AND delete_flg = '0'
    AND (
        (target_type = 'ALL' AND public.get_jwt_user_type() = '1')
        OR (target_type = 'CLIENT' AND public.get_jwt_user_type() = '1' AND client_id = public.get_jwt_client_id())
        OR (target_type = 'COACH' AND public.get_jwt_user_type() = '2')
        OR (
            public.get_jwt_user_type() = '2'
            AND EXISTS (
                SELECT 1 FROM public.com_t_calendar_event_coach c
                WHERE c.calendar_event_id = com_m_calendar_event.calendar_event_id
                  AND c.coach_id = auth.uid()
            )
        )
    )
);
