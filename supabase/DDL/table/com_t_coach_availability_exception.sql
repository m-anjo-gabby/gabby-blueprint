-- =========================================================================
-- com_t_coach_availability_exception: コーチの空き時間の例外（特定の日の休み等）
-- =========================================================================
-- 毎週の空き時間（com_m_coach_availability）から外れる特定の日付（祝日の休み・臨時の休み等）を持つ。
-- 日付・時刻はコーチの現地の値。マッチングの空きの判定とセッションの生成（fn_matching_occurrence_busy）は、
-- BLOCK の時間帯と重なる回を予約できないものとして扱う（作らずに未予約の回に数える）。
-- コーチ本人が自分の例外を管理し、認証済みユーザーなら誰でも参照できる（生徒がコーチの空きを確かめるため）。
-- =========================================================================

-- @schema public.com_t_coach_availability_exception
CREATE TABLE public.com_t_coach_availability_exception (
    exception_id             uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    exception_date           date         NOT NULL,
    start_time               time without time zone NOT NULL,
    end_time                 time without time zone NOT NULL,
    exception_type           text         NOT NULL,
    note                     text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_availability_exception_time_range CHECK (end_time > start_time),
    CONSTRAINT chk_availability_exception_type CHECK (exception_type = ANY (ARRAY['BLOCK'::text, 'ADD'::text]))
);

COMMENT ON TABLE public.com_t_coach_availability_exception IS 'コーチ空き時間の例外（特定日の休み・臨時追加。コーチのローカル時刻basis）';
COMMENT ON COLUMN public.com_t_coach_availability_exception.exception_id IS '例外ID';
COMMENT ON COLUMN public.com_t_coach_availability_exception.coach_id IS 'コーチのユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_coach_availability_exception.exception_date IS '対象日（コーチのローカル日付）';
COMMENT ON COLUMN public.com_t_coach_availability_exception.start_time IS '対象開始時刻（コーチのローカル時刻）';
COMMENT ON COLUMN public.com_t_coach_availability_exception.end_time IS '対象終了時刻（コーチのローカル時刻）';
COMMENT ON COLUMN public.com_t_coach_availability_exception.exception_type IS '例外種別 BLOCK:休み(通常空き時間を無効化) / ADD:臨時追加(通常空き時間に追加)';
COMMENT ON COLUMN public.com_t_coach_availability_exception.note IS '理由等のメモ';
COMMENT ON COLUMN public.com_t_coach_availability_exception.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_coach_availability_exception.update_date IS '更新日時';

CREATE INDEX idx_availability_exception_coach_date ON public.com_t_coach_availability_exception (coach_id, exception_date);

ALTER TABLE public.com_t_coach_availability_exception ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their own availability exceptions" ON public.com_t_coach_availability_exception FOR ALL TO authenticated
USING (
    coach_id = auth.uid()
)
WITH CHECK (
    coach_id = auth.uid()
);

CREATE POLICY "Relevant users can view availability exceptions" ON public.com_t_coach_availability_exception FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
