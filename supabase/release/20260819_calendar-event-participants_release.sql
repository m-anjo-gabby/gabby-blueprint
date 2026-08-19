-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260814-dev
-- 作成日: 2026-08-19
--
-- 【内容】
--   カレンダーイベント 参加者管理機能の追加
--   前提: 20260819_calendar-events_release.sql の適用が完了していること。
--
--   1. com_m_calendar_event に rsvp_enabled（参加確認フラグ）列を追加
--      - TRUEのイベント（主にグループセッション）のみ、生徒/コーチが参加登録・
--        キャンセルできるようにする。管理画面のイベント登録フォームでON/OFFを
--        切り替える。
--   2. com_t_calendar_event_participant を新規作成
--      - 行が存在すれば「参加」、DELETEで「キャンセル」を表す単純な結合テーブル
--        （com_t_favorite_phraseと同じ設計。ステータス列・取消履歴は持たない）。
--      - 定員管理・キャンセル待ちは対象外。
--   3. 管理画面（apps/admin）にイベント単位の参加者一覧確認画面を追加
--      （本SQLの対象外、アプリケーションコードのみの変更）。
--   4. 生徒向けカレンダー（apps/student）のイベント詳細に「参加する/キャンセル」
--      導線と、参加済みの場合のみの参加リンク表示を追加
--      （本SQLの対象外、アプリケーションコードのみの変更）。
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   再実行しても副作用がないよう、全ステップを冪等に作成しています。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. com_m_calendar_event.rsvp_enabled 追加
-- =========================================================================
ALTER TABLE public.com_m_calendar_event
  ADD COLUMN IF NOT EXISTS rsvp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.com_m_calendar_event.rsvp_enabled IS '参加確認フラグ (TRUE: 生徒/コーチが参加登録・キャンセルできる / FALSE: 参加確認機能を使わない告知)';

-- =========================================================================
-- 2. com_t_calendar_event_participant 新規作成
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_calendar_event_participant (
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

CREATE INDEX IF NOT EXISTS idx_calendar_event_participant_event ON public.com_t_calendar_event_participant (calendar_event_id);

ALTER TABLE public.com_t_calendar_event_participant ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own participation" ON public.com_t_calendar_event_participant;
CREATE POLICY "Users can manage their own participation" ON public.com_t_calendar_event_participant
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

COMMIT;
