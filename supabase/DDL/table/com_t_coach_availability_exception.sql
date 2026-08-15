---------------------------------------------
-- DDL: com_t_coach_availability_exception (コーチ空き時間の例外) (2026-08-15 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_m_coach_availability.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- com_m_coach_availability は「毎週火曜18:00〜22:00」のような週次の定常パターンを
-- 表すが、祝日休み・臨時休講・単発の追加対応など、特定の日付だけ定常パターンから
-- 外れるケースを表現するための例外テーブル。
-- Session自動生成（fn_generate_sessions_for_schedule）は、対象日が本テーブルの
-- BLOCK対象時間帯と重なる場合はその回をスキップする想定（Phase2以降で対応）。
---------------------------------------------
CREATE TABLE public.com_t_coach_availability_exception (
    exception_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    exception_date date NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    exception_type text NOT NULL, -- 'BLOCK': 休み, 'ADD': 臨時追加
    note text DEFAULT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_availability_exception_type CHECK (exception_type IN ('BLOCK', 'ADD')),
    CONSTRAINT chk_availability_exception_time_range CHECK (end_time > start_time)
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

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_coach_availability_exception ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Relevant users can view availability exceptions" ON public.com_t_coach_availability_exception;
DROP POLICY IF EXISTS "Coaches can manage their own availability exceptions" ON public.com_t_coach_availability_exception;

-- [参照] com_m_coach_availabilityと同様、生徒がコーチの空き状況を確認できるよう認証済みユーザーなら誰でも閲覧可能とする。
CREATE POLICY "Relevant users can view availability exceptions" ON public.com_t_coach_availability_exception
FOR SELECT TO authenticated USING (true);

-- [登録・更新・削除] コーチ本人のみ自身の例外を管理可能
CREATE POLICY "Coaches can manage their own availability exceptions" ON public.com_t_coach_availability_exception
FOR ALL TO authenticated
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());
