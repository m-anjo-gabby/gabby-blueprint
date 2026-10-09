---------------------------------------------
-- DDL: com_t_calendar_event_participant (カレンダーイベント参加者) (2026-08-19 追加)
---------------------------------------------
-- 【背景】
-- com_m_calendar_event（rsvp_enabled=TRUEのイベント、主にグループセッション）に
-- 対する参加登録。ステータス列は持たず、行が存在すれば「参加」、DELETEで
-- 「キャンセル」を表す単純な結合テーブル（com_t_favorite_phraseと同じ設計）。
-- 取消履歴を残す要件は無いため、キャンセル時は行を削除する。
--
-- 定員管理・キャンセル待ちは対象外（Phase1スコープ外）。
---------------------------------------------
CREATE TABLE public.com_t_calendar_event_participant (
    participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    calendar_event_id UUID NOT NULL REFERENCES public.com_m_calendar_event(calendar_event_id) ON DELETE CASCADE,
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, calendar_event_id)
);

COMMENT ON TABLE public.com_t_calendar_event_participant IS 'カレンダーイベント参加者（行が存在すれば参加、DELETEでキャンセル）';
COMMENT ON COLUMN public.com_t_calendar_event_participant.participant_id IS '参加ID';
COMMENT ON COLUMN public.com_t_calendar_event_participant.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_calendar_event_participant.calendar_event_id IS 'カレンダーイベントID';
COMMENT ON COLUMN public.com_t_calendar_event_participant.insert_date IS '参加登録日時';

CREATE INDEX idx_calendar_event_participant_event ON public.com_t_calendar_event_participant (calendar_event_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_calendar_event_participant ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own participation" ON public.com_t_calendar_event_participant;

-- 本人のみ自分の参加行を作成・削除・参照可能（管理画面はservice-roleクライアント経由でRLSをバイパスして全参加者を閲覧する）
CREATE POLICY "Users can manage their own participation" ON public.com_t_calendar_event_participant
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

---------------------------------------------
-- 参加登録を、本人に見えている参加確認ありのイベントに限るパッチ (2026-10-10 追加)
---------------------------------------------
-- 既存環境に対しては、このDROP POLICY/CREATE POLICY文のみを適用してください。
-- 【背景】
-- 従来のポリシーは本人の行かどうかだけを確かめていたため、画面を通さずに直接登録すれば、
-- 配信対象外（別の顧客向け）の回にも参加登録でき、その回のアナウンスを読め、リマインダーメールに参加URLが載った。
-- 登録・更新（WITH CHECK）で、イベント本体が本人から見えること（com_m_calendar_event の RLS：公開済み・配信対象・
-- 担当コーチ）と参加確認ありであることを確かめる。参照・取り消し（USING）は従来どおり本人の行だけ。
-- service_role（テストの準備・管理画面）は RLS の対象外のため影響しない。
---------------------------------------------
DROP POLICY IF EXISTS "Users can manage their own participation" ON public.com_t_calendar_event_participant;
CREATE POLICY "Users can manage their own participation" ON public.com_t_calendar_event_participant
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
    user_id = auth.uid()
    -- 参加登録できるのは、本人に見えている（公開済み・配信対象。イベント本体の RLS で判定）参加確認ありのイベントだけ
    AND EXISTS (
        SELECT 1 FROM public.com_m_calendar_event e
        WHERE e.calendar_event_id = com_t_calendar_event_participant.calendar_event_id
          AND e.rsvp_enabled = TRUE
    )
);
