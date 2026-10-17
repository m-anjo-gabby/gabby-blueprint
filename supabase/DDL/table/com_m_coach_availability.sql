-- =========================================================================
-- com_m_coach_availability: コーチの空き時間（毎週の繰り返しの時間帯）
-- =========================================================================
-- 【役割】
-- コーチがレッスンできる曜日・時間帯（例: 毎週火曜 18:00〜22:00）の大枠。25分・30分の枠への細分は画面側で行う。
--
-- 【時刻は UTC】
-- day_of_week / start_time / end_time は UTC の曜日・時刻。空き時間は日本の生徒向けに出す枠とみなし、
-- 生徒から見た時刻を固定する。コーチの現地時刻での表示は夏時間の切り替えでずれるため、コーチに定期的に
-- 見直しを促す（function/enqueue_coach_availability_reminders.sql）。UTC で日をまたぐ時間帯は日ごとの
-- 2行に分ける（end_time > start_time のため。日の終わりは 24:00:00）。
-- テーブルのコメントの「UTC基準」は UTC への変換済みの目印（変換スクリプトが二重に変換しないよう判定に使った）。
--
-- 【書き込み・参照】
-- コーチ本人が自分の空き時間を登録・更新・削除する。有効な行は認証済みユーザーなら誰でも参照できる
-- （生徒がコーチを選ぶため）。変更時はトリガーが com_m_coach_profile.availability_confirmed_at を更新する。
-- =========================================================================

-- @schema public.com_m_coach_availability
CREATE TABLE public.com_m_coach_availability (
    availability_id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    day_of_week              smallint     NOT NULL,
    start_time               time without time zone NOT NULL,
    end_time                 time without time zone NOT NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_coach_availability_day CHECK (day_of_week >= 0 AND day_of_week <= 6),
    CONSTRAINT chk_coach_availability_time_range CHECK (end_time > start_time)
);

COMMENT ON TABLE public.com_m_coach_availability IS 'コーチ空き時間マスタ（週次繰り返しのレッスン可能時間帯。UTC基準）';
COMMENT ON COLUMN public.com_m_coach_availability.availability_id IS '空き時間ID';
COMMENT ON COLUMN public.com_m_coach_availability.coach_id IS 'コーチのユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_availability.day_of_week IS '曜日 0:日 1:月 2:火 3:水 4:木 5:金 6:土（UTC基準）';
COMMENT ON COLUMN public.com_m_coach_availability.start_time IS '対応可能開始時刻（UTC）';
COMMENT ON COLUMN public.com_m_coach_availability.end_time IS '対応可能終了時刻（UTC。日の終わりは24:00:00）';
COMMENT ON COLUMN public.com_m_coach_availability.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_coach_availability.update_date IS '更新日時';

CREATE INDEX idx_coach_availability_coach ON public.com_m_coach_availability (coach_id);

CREATE TRIGGER on_coach_availability_change_confirm AFTER INSERT OR DELETE OR UPDATE ON public.com_m_coach_availability FOR EACH ROW EXECUTE FUNCTION public.trg_coach_availability_confirmed();
CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_coach_availability FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_coach_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active coach availability" ON public.com_m_coach_availability FOR SELECT TO authenticated
USING (
    true
);

CREATE POLICY "Coaches can manage their own availability" ON public.com_m_coach_availability FOR ALL TO authenticated
USING (
    coach_id = auth.uid()
)
WITH CHECK (
    coach_id = auth.uid()
);
-- @end-schema
