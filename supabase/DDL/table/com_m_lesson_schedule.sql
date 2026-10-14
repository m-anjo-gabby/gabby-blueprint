-- =========================================================================
-- com_m_lesson_schedule: 定期スケジュール（専属コーチの「毎週◯曜◯時」の枠）
-- =========================================================================
-- 【役割】
-- マッチング申請（com_t_matching_request）が承認されて成立した枠。成立時に契約期間分の
-- com_t_session（個々の回）を作る。以後のキャンセル・予約は com_t_session の行に対して行い、
-- 本テーブルの曜日・時刻は変えない。同じチケット・同じ枠で稼働中（status=1）の行は1件だけ。
--
-- 【書き込み】
-- RLS は参照（生徒本人・担当コーチ・管理者）のみ許可し、作成・一時停止・終了は
-- approve_matching_request() 等の SECURITY DEFINER の関数で行う。
-- 変更時はトリガーが com_m_coach_student_relationship を同期する。
--
-- 【時刻】
-- day_of_week / start_time / end_time / start_date / end_date は schedule_timezone での値。
-- 新しい行は成立元の申請の requested_timezone（生徒の申請時のタイムゾーン）を引き継ぐため、
-- 夏時間の切り替えの前後でも生徒側の時刻は変わらない。コーチのタイムゾーンで成立した古い行も、
-- schedule_timezone で解釈すれば正しく動く（変換はしていない）。
-- セッションの生成（fn_generate_sessions_for_schedule）は必ず schedule_timezone を使う。
--
-- 【回数の目標（target_sessions）】
-- 枠ごとの契約上の回数。成立時に total_sessions / weekly_frequency で決め、余りは slot_no の小さい枠から
-- 1つずつ多く配る（例: 週3回25回なら 9・8・8）。セッションの生成の上限と不足の判定（fn_schedule_shortfall）は
-- この値を基準にする。契約終了日までに満たなくても自動では延長せず、不足として見せて運用で判断する。
-- =========================================================================

-- @schema public.com_m_lesson_schedule
CREATE TABLE public.com_m_lesson_schedule (
    schedule_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id                uuid         NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE CASCADE,
    student_id               uuid         NOT NULL REFERENCES public.com_m_user(id),
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id),
    slot_no                  smallint     NOT NULL,
    day_of_week              smallint     NOT NULL,
    start_time               time without time zone NOT NULL,
    end_time                 time without time zone NOT NULL,
    status                   smallint     NOT NULL DEFAULT 1,
    start_date               date         NOT NULL,
    end_date                 date         NOT NULL,
    source_request_id        uuid         REFERENCES public.com_t_matching_request(request_id),
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    schedule_timezone        text         NOT NULL REFERENCES public.com_m_timezone(timezone),
    target_sessions          smallint     NOT NULL,
    CONSTRAINT chk_lesson_schedule_date_range CHECK (end_date >= start_date),
    CONSTRAINT chk_lesson_schedule_day CHECK (day_of_week >= 0 AND day_of_week <= 6),
    CONSTRAINT chk_lesson_schedule_slot_no CHECK (slot_no >= 1),
    CONSTRAINT chk_lesson_schedule_status CHECK (status = ANY (ARRAY[0, 1, 9])),
    CONSTRAINT chk_lesson_schedule_target_sessions CHECK (target_sessions >= 1),
    CONSTRAINT chk_lesson_schedule_time_range CHECK (end_time > start_time)
);

COMMENT ON TABLE public.com_m_lesson_schedule IS '定期レッスンスケジュール（承認済みマッチング。毎週◯曜◯時の専属レッスン枠）';
COMMENT ON COLUMN public.com_m_lesson_schedule.schedule_id IS 'スケジュールID';
COMMENT ON COLUMN public.com_m_lesson_schedule.ticket_id IS '対象のライブセッションチケット (com_t_user_session_ticket)';
COMMENT ON COLUMN public.com_m_lesson_schedule.student_id IS '生徒のユーザID';
COMMENT ON COLUMN public.com_m_lesson_schedule.coach_id IS '専属コーチのユーザID';
COMMENT ON COLUMN public.com_m_lesson_schedule.slot_no IS '週n回契約のうち何枠目か（1始まり）';
COMMENT ON COLUMN public.com_m_lesson_schedule.day_of_week IS '曜日 0:日 ... 6:土（schedule_timezone基準）';
COMMENT ON COLUMN public.com_m_lesson_schedule.start_time IS 'レッスン開始時刻（schedule_timezoneの現地時刻）';
COMMENT ON COLUMN public.com_m_lesson_schedule.end_time IS 'レッスン終了時刻（schedule_timezoneの現地時刻、通常25分）';
COMMENT ON COLUMN public.com_m_lesson_schedule.status IS 'ステータス 1:active(稼働中) 0:paused(一時停止) 9:terminated(終了)';
COMMENT ON COLUMN public.com_m_lesson_schedule.start_date IS 'Session自動生成の起点日（schedule_timezoneの日付）';
COMMENT ON COLUMN public.com_m_lesson_schedule.end_date IS 'Session自動生成の終点日（通常はライセンス終了日、schedule_timezoneの日付）';
COMMENT ON COLUMN public.com_m_lesson_schedule.source_request_id IS '成立元のマッチングリクエスト';
COMMENT ON COLUMN public.com_m_lesson_schedule.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_lesson_schedule.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_lesson_schedule.schedule_timezone IS 'day_of_week/start_time/end_time/start_date/end_dateの解釈に使うIANAタイムゾーン。2026-10-06以降の成立分は生徒の申請時のタイムゾーン（com_t_matching_request.requested_timezone）、それ以前の成立分はコーチの承認時のタイムゾーン。以後のプロフィールのtimezone変更の影響を受けない';
COMMENT ON COLUMN public.com_m_lesson_schedule.target_sessions IS 'このコマ(slot_no)が契約上持つべき目標セッション数。承認時にtotal_sessions/weekly_frequencyの均等割り(余りはslot_no昇順に配分)で確定し、以後は不変。fn_generate_sessions_for_schedule()の生成上限、fn_schedule_shortfall()の期待値として使う唯一の真実源。正当な理由がある追加予約の例外措置として、admin_adjust_schedule_target_sessions()経由でtotal_sessionsを変更せずに個別枠のみ引き上げ可能（詳細は同関数のコメント参照）。';

CREATE INDEX idx_lesson_schedule_coach ON public.com_m_lesson_schedule (coach_id, status);
CREATE INDEX idx_lesson_schedule_student ON public.com_m_lesson_schedule (student_id, status);
CREATE UNIQUE INDEX uq_lesson_schedule_active_slot ON public.com_m_lesson_schedule (ticket_id, slot_no) WHERE status = 1;

CREATE TRIGGER on_lesson_schedule_change_sync_relationship AFTER INSERT OR DELETE OR UPDATE ON public.com_m_lesson_schedule FOR EACH ROW EXECUTE FUNCTION public.sync_coach_student_relationship();

ALTER TABLE public.com_m_lesson_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved users can view lesson schedules" ON public.com_m_lesson_schedule FOR SELECT TO authenticated
USING (
    student_id = auth.uid() OR coach_id = auth.uid() OR public.get_jwt_user_type() = '0'::text
);
-- @end-schema
