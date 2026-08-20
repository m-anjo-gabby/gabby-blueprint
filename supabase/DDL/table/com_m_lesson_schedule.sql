---------------------------------------------
-- DDL: com_m_lesson_schedule (定期レッスンスケジュール) (2026-08-15 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_matching_request.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- マッチングリクエストがコーチに承認され、「毎週◯曜◯時」の専属レッスン枠として
-- 成立した状態を表すマスタ（フロー図の②Matching/Lesson Scheduleに相当）。
-- 生成・更新は常に approve_matching_request()（SECURITY DEFINER）経由。
-- 個々の実施回（③Session）は本レコード確定時に契約期間分まとめて自動生成され、
-- 以降のキャンセル・振替・日時変更はcom_t_session側の個別行を操作することで行い、
-- 本テーブル（基本の曜日・時刻パターン）は変更しないのが原則
-- （＝「定期スケジュールは基本的に維持」）。
--
-- 【coach_timezoneについて】
-- day_of_week/start_time/end_timeはcom_m_coach_availabilityと同様「コーチのローカル時刻」
-- だが、com_m_user.timezoneはコーチ本人がプロフィールから随時変更できるため、ライブ参照だと
-- 承認後にコーチがタイムゾーンを変更した場合、生徒が合意した曜日・時刻の意味が事後的に
-- ズレてしまう。そのため本テーブルは承認時点のcom_m_user.timezoneをcoach_timezoneとして
-- 固定保持し、以降のSession生成（fn_generate_sessions_for_schedule）は必ずこの値を使う。
-- 生徒側のタイムゾーンは保持しない（表示変換は常に閲覧者の"現在の"timezoneで行うため不要）。
---------------------------------------------
CREATE TABLE public.com_m_lesson_schedule (
    schedule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    slot_no smallint NOT NULL, -- 週n回契約のうち何枠目か（1始まり）
    day_of_week smallint NOT NULL, -- 0:日 ... 6:土（coach_idのローカル時刻基準）
    start_time time NOT NULL,
    end_time time NOT NULL,
    coach_timezone text NOT NULL REFERENCES public.com_m_timezone(timezone), -- day_of_week/start_time/end_timeの解釈基準（マッチング承認時点のcom_m_user.timezoneを固定）
    status smallint NOT NULL DEFAULT 1, -- 1:active 0:paused 9:terminated
    start_date date NOT NULL, -- Session自動生成の起点日（コーチのローカル日付）
    end_date date NOT NULL,   -- Session自動生成の終点日（通常はライセンス終了日、コーチのローカル日付）
    source_request_id uuid REFERENCES public.com_t_matching_request(request_id),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_lesson_schedule_slot_no CHECK (slot_no >= 1),
    CONSTRAINT chk_lesson_schedule_day CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_lesson_schedule_time_range CHECK (end_time > start_time),
    CONSTRAINT chk_lesson_schedule_date_range CHECK (end_date >= start_date),
    CONSTRAINT chk_lesson_schedule_status CHECK (status IN (0, 1, 9))
);

COMMENT ON TABLE public.com_m_lesson_schedule IS '定期レッスンスケジュール（承認済みマッチング。毎週◯曜◯時の専属レッスン枠）';
COMMENT ON COLUMN public.com_m_lesson_schedule.schedule_id IS 'スケジュールID';
COMMENT ON COLUMN public.com_m_lesson_schedule.ticket_id IS '対象のライブセッションチケット (com_t_user_session_ticket)';
COMMENT ON COLUMN public.com_m_lesson_schedule.student_id IS '生徒のユーザID';
COMMENT ON COLUMN public.com_m_lesson_schedule.coach_id IS '専属コーチのユーザID';
COMMENT ON COLUMN public.com_m_lesson_schedule.slot_no IS '週n回契約のうち何枠目か（1始まり）';
COMMENT ON COLUMN public.com_m_lesson_schedule.day_of_week IS '曜日 0:日 ... 6:土（コーチのローカル時刻基準）';
COMMENT ON COLUMN public.com_m_lesson_schedule.start_time IS 'レッスン開始時刻（コーチのローカル時刻）';
COMMENT ON COLUMN public.com_m_lesson_schedule.end_time IS 'レッスン終了時刻（コーチのローカル時刻、通常25分）';
COMMENT ON COLUMN public.com_m_lesson_schedule.coach_timezone IS 'day_of_week/start_time/end_timeの解釈に使うIANAタイムゾーン（承認時点のcom_m_user.timezoneをスナップショットし、以後のコーチ側timezone変更の影響を受けない）';
COMMENT ON COLUMN public.com_m_lesson_schedule.status IS 'ステータス 1:active(稼働中) 0:paused(一時停止) 9:terminated(終了)';
COMMENT ON COLUMN public.com_m_lesson_schedule.start_date IS 'Session自動生成の起点日（コーチのローカル日付）';
COMMENT ON COLUMN public.com_m_lesson_schedule.end_date IS 'Session自動生成の終点日（通常はライセンス終了日、コーチのローカル日付）';
COMMENT ON COLUMN public.com_m_lesson_schedule.source_request_id IS '成立元のマッチングリクエスト';
COMMENT ON COLUMN public.com_m_lesson_schedule.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_lesson_schedule.update_date IS '更新日時';

-- 同一チケット・同一枠についてactiveなスケジュールは同時に1件のみ
CREATE UNIQUE INDEX uq_lesson_schedule_active_slot ON public.com_m_lesson_schedule (ticket_id, slot_no)
    WHERE status = 1;

CREATE INDEX idx_lesson_schedule_student ON public.com_m_lesson_schedule (student_id, status);
CREATE INDEX idx_lesson_schedule_coach ON public.com_m_lesson_schedule (coach_id, status);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_lesson_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view lesson schedules" ON public.com_m_lesson_schedule;

-- [参照] 生徒本人・担当コーチ・管理者のみ閲覧可能。
-- 登録・更新（承認処理での作成、一時停止・終了）は approve_matching_request() 等の
-- SECURITY DEFINER関数経由のみとし、authenticatedロールへのINSERT/UPDATE権限は付与しない。
CREATE POLICY "Involved users can view lesson schedules" ON public.com_m_lesson_schedule
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

---------------------------------------------
-- 追加パッチ: coach_timezoneスナップショット対応 (2026-08-17)
-- 既存環境に対しては、このブロックのみをSupabase SQL Editor等で実行してください。
-- 【背景】上記コメント【coach_timezoneについて】を参照。
---------------------------------------------
ALTER TABLE public.com_m_lesson_schedule
  ADD COLUMN IF NOT EXISTS coach_timezone text;

-- 既存行は承認時点のタイムゾーンが記録されていないため、現在のコーチtimezoneで暫定バックフィルする
UPDATE public.com_m_lesson_schedule s
SET coach_timezone = COALESCE(u.timezone, 'Asia/Tokyo')
FROM public.com_m_user u
WHERE u.id = s.coach_id AND s.coach_timezone IS NULL;

ALTER TABLE public.com_m_lesson_schedule
  ALTER COLUMN coach_timezone SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'com_m_lesson_schedule_coach_timezone_fkey'
  ) THEN
    ALTER TABLE public.com_m_lesson_schedule
      ADD CONSTRAINT com_m_lesson_schedule_coach_timezone_fkey FOREIGN KEY (coach_timezone)
      REFERENCES public.com_m_timezone(timezone);
  END IF;
END $$;

COMMENT ON COLUMN public.com_m_lesson_schedule.coach_timezone IS 'day_of_week/start_time/end_timeの解釈に使うIANAタイムゾーン（承認時点のcom_m_user.timezoneをスナップショットし、以後のコーチ側timezone変更の影響を受けない）';
