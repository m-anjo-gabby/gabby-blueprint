---------------------------------------------
-- DDL: com_m_coach_availability (コーチ空き時間マスタ) (2026-08-15 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- オンラインレッスン（ライブセッション）の専属コーチマッチング機能の第一段階。
-- コーチが「毎週火曜 18:00〜22:00」のように、レッスン可能な曜日・時間帯を
-- 週次の繰り返しパターンとして登録するマスタ。
-- 1レッスンは25分・30分単位の枠が前提だが、枠の細分はUI側で扱い、
-- 本テーブルはコーチが対応可能な大枠の時間帯（例: 18:00〜22:00）のみを持つ。
--
-- 【タイムゾーンの扱い】
-- day_of_week / start_time / end_time は、コーチ本人のローカル時刻（壁時計時刻）
-- として保持する（com_m_user.timezone基準）。「毎週火曜18時」のような繰り返し予定は
-- 絶対時刻(UTC)ではなくローカル時刻で持つことで、コーチのタイムゾーンがDST等で
-- 変動した場合でも「現地時間の火曜18時」を正しく維持できる。
-- 実際の日時（絶対時刻）への変換は、Session生成時（fn_generate_sessions_for_schedule）
-- に行う。
---------------------------------------------
CREATE TABLE public.com_m_coach_availability (
    availability_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    day_of_week smallint NOT NULL, -- 0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土
    start_time time NOT NULL,
    end_time time NOT NULL,
    delete_flg text NOT NULL DEFAULT '0',
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_coach_availability_day CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_coach_availability_time_range CHECK (end_time > start_time)
);

COMMENT ON TABLE public.com_m_coach_availability IS 'コーチ空き時間マスタ（週次繰り返しのレッスン可能時間帯。コーチのローカル時刻basis）';
COMMENT ON COLUMN public.com_m_coach_availability.availability_id IS '空き時間ID';
COMMENT ON COLUMN public.com_m_coach_availability.coach_id IS 'コーチのユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_availability.day_of_week IS '曜日 0:日 1:月 2:火 3:水 4:木 5:金 6:土（コーチのローカル時刻基準）';
COMMENT ON COLUMN public.com_m_coach_availability.start_time IS '対応可能開始時刻（コーチのローカル時刻）';
COMMENT ON COLUMN public.com_m_coach_availability.end_time IS '対応可能終了時刻（コーチのローカル時刻）';
COMMENT ON COLUMN public.com_m_coach_availability.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_coach_availability.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_coach_availability.update_date IS '更新日時';

CREATE INDEX idx_coach_availability_coach ON public.com_m_coach_availability (coach_id, delete_flg);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_coach_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active coach availability" ON public.com_m_coach_availability;
DROP POLICY IF EXISTS "Coaches can manage their own availability" ON public.com_m_coach_availability;

-- [参照] 生徒がコーチ選択時に空き時間を確認する想定のため、有効な行は認証済みユーザーなら誰でも閲覧可能。
-- 自分自身の行は delete_flg の状態に関わらず常に参照可能とする。
CREATE POLICY "Anyone can view active coach availability" ON public.com_m_coach_availability
FOR SELECT TO authenticated USING (
    delete_flg = '0' OR coach_id = auth.uid() OR public.get_jwt_user_type() = '0'
);

-- [登録・更新・削除] コーチ本人のみ自身の空き時間を管理可能
CREATE POLICY "Coaches can manage their own availability" ON public.com_m_coach_availability
FOR ALL TO authenticated
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());
