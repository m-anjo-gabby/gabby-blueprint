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
-- 【タイムゾーンの扱い】(2026-10-06 変更: UTC基準。末尾の追加パッチ参照)
-- day_of_week / start_time / end_time は UTC の曜日・時刻として保持する。
-- 空き時間は「コーチが日本の生徒向けに提供する枠」とみなし、生徒（主に日本時間）から見た
-- 枠の時刻を固定する。コーチの現地時刻での表示は夏時間の切り替えで1時間ずれる（コーチは
-- 定期的に空き時間を見直す。function/enqueue_coach_availability_reminders.sql 参照）。
-- UTCで日をまたぐ時間帯は、日ごとの2行に分けて持つ（end_time > start_time のため。
-- 日の終わりは 24:00:00）。
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

COMMENT ON TABLE public.com_m_coach_availability IS 'コーチ空き時間マスタ（週次繰り返しのレッスン可能時間帯。UTC基準）';
COMMENT ON COLUMN public.com_m_coach_availability.availability_id IS '空き時間ID';
COMMENT ON COLUMN public.com_m_coach_availability.coach_id IS 'コーチのユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_availability.day_of_week IS '曜日 0:日 1:月 2:火 3:水 4:木 5:金 6:土（UTC基準）';
COMMENT ON COLUMN public.com_m_coach_availability.start_time IS '対応可能開始時刻（UTC）';
COMMENT ON COLUMN public.com_m_coach_availability.end_time IS '対応可能終了時刻（UTC。日の終わりは24:00:00）';
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

---------------------------------------------
-- 追加パッチ: UTC基準への変更 (2026-10-06)
-- 既存環境に対しては、このブロックのみを実行してください（2回目以降の実行は何もしない）。
---------------------------------------------
-- 【背景】
-- コーチの現地時刻で持つと、コーチ側の夏時間の切り替えで、生徒（日本時間）から見た枠・
-- セッションの時刻が1時間ずれていた。空き時間をUTCで持ち、生徒から見た枠の時刻を固定する
-- （申請・定期スケジュールは生徒の申請時のタイムゾーンで持つ。table/com_t_matching_request.sql 参照）。
--
-- 【既存行の変換】
-- 各行を、適用した時点のコーチのタイムゾーン（com_m_user.timezone）の時差でUTCへ変換する
-- （適用直後のコーチの画面には、変換前と同じ現地時刻で表示される）。UTCで日をまたぐ行は
-- 2行に分ける（後半を新しい行として追加する）。論理削除済みの行も同じ基準にそろえる。
-- 変換済みかどうかはテーブルのコメント（'UTC基準'）で判定し、2回目以降は何もしない。
---------------------------------------------
DO $$
BEGIN
    IF obj_description('public.com_m_coach_availability'::regclass, 'pg_class') LIKE '%UTC基準%' THEN
        RAISE NOTICE 'com_m_coach_availability is already UTC based. skipped.';
        RETURN;
    END IF;

    CREATE TEMP TABLE tmp_availability_utc ON COMMIT DROP AS
    WITH src AS (
        SELECT
            a.availability_id,
            a.end_time - a.start_time AS duration,
            -- 現地の今日以降で、最初にその曜日になる日（その日の時差で変換する）
            ((NOW() AT TIME ZONE tz.name)::date
                + ((a.day_of_week - EXTRACT(DOW FROM (NOW() AT TIME ZONE tz.name))::int + 7) % 7)
                + a.start_time) AT TIME ZONE tz.name AS start_ts
        FROM public.com_m_coach_availability a
        JOIN public.com_m_user u ON u.id = a.coach_id
        CROSS JOIN LATERAL (SELECT COALESCE(u.timezone, 'Asia/Tokyo') AS name) tz
    )
    SELECT
        availability_id,
        (start_ts AT TIME ZONE 'UTC') AS start_utc,
        (start_ts AT TIME ZONE 'UTC') + duration AS end_utc
    FROM src;

    -- UTCで日をまたぐ行の後半（翌日の 00:00〜）を新しい行として追加する
    INSERT INTO public.com_m_coach_availability (coach_id, day_of_week, start_time, end_time, delete_flg, insert_date, update_date)
    SELECT a.coach_id, EXTRACT(DOW FROM t.end_utc)::smallint, '00:00:00'::time, t.end_utc::time, a.delete_flg, a.insert_date, NOW()
    FROM tmp_availability_utc t
    JOIN public.com_m_coach_availability a ON a.availability_id = t.availability_id
    WHERE t.end_utc::date > t.start_utc::date
      AND t.end_utc::time > '00:00:00'::time;

    UPDATE public.com_m_coach_availability a
    SET day_of_week = EXTRACT(DOW FROM t.start_utc)::smallint,
        start_time = t.start_utc::time,
        end_time = CASE WHEN t.end_utc::date > t.start_utc::date THEN '24:00:00'::time ELSE t.end_utc::time END,
        update_date = NOW()
    FROM tmp_availability_utc t
    WHERE a.availability_id = t.availability_id;

    COMMENT ON TABLE public.com_m_coach_availability IS 'コーチ空き時間マスタ（週次繰り返しのレッスン可能時間帯。UTC基準）';
    COMMENT ON COLUMN public.com_m_coach_availability.day_of_week IS '曜日 0:日 1:月 2:火 3:水 4:木 5:金 6:土（UTC基準）';
    COMMENT ON COLUMN public.com_m_coach_availability.start_time IS '対応可能開始時刻（UTC）';
    COMMENT ON COLUMN public.com_m_coach_availability.end_time IS '対応可能終了時刻（UTC。日の終わりは24:00:00）';
END $$;
