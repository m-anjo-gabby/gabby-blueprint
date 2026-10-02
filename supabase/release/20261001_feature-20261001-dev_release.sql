-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20261001-dev
-- 作成日: 2026-10-02
--
-- 【内容】
--   スプリントのレベル管理の有無（生徒単位）。
--
--   1. student_m_sprint_progress に level_managed 列を追加
--      - false の生徒はスプリントの全レベルを選択できる（アドミンのユーザー管理で設定）。
--        既存データは true（従来通り到達レベル＋1まで）。
--   2. student_m_sprint_progress の本人向けポリシーを FOR ALL から SELECT のみに変更
--      - 生徒アプリは参照のみのため動作に影響なし。生徒が自分の到達レベル・level_managed を
--        書き換えられないようにする。
--
-- 対応ファイル: DDL/table/student_m_sprint_progress.sql（末尾の追加パッチ節）
--
-- 【実行方法】
--   supabase/release/README.md の手順に従い run.mjs で適用してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   アプリ側が level_managed 列を参照するため、アプリのデプロイより先に適用すること。
-- =========================================================================

BEGIN;

ALTER TABLE public.student_m_sprint_progress
  ADD COLUMN IF NOT EXISTS level_managed BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.student_m_sprint_progress.level_managed IS 'スプリントのレベル管理 (true:到達レベル+1まで選択可, false:全レベル選択可)';

DROP POLICY IF EXISTS "Users can manage their own sprint progress" ON public.student_m_sprint_progress;
DROP POLICY IF EXISTS "Users can view their own sprint progress" ON public.student_m_sprint_progress;
CREATE POLICY "Users can view their own sprint progress" ON public.student_m_sprint_progress
FOR SELECT TO authenticated
USING (user_id = auth.uid());

COMMIT;

-- =========================================================================
-- 【追加セクション】スプリント教材の問題が存在する種別×レベルの一覧取得
-- 追加日: 2026-10-02
--
-- 【内容】
--   生徒の自主トレの選択画面・コーチのLive Sprintの設定画面で、問題の無い種別・レベルを
--   選べないようにするため、教材ごとの「問題が存在する種別×レベル」を返す関数と、
--   それを索引だけで集計するためのインデックスを追加する。
--
--   1. com_m_sprint_questions に idx_sprint_questions_content_level を追加
--   2. get_sprint_available_levels(uuid[]) を新規作成（SECURITY INVOKER）
--
-- 対応ファイル: DDL/table/com_m_sprint_questions.sql, DDL/function/get_sprint_available_levels.sql
-- 【注意】アプリ側が 2 を呼ぶため、アプリのデプロイより先に適用すること。
-- =========================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_sprint_questions_content_level
ON public.com_m_sprint_questions (content_id, question_type, difficulty_level)
WHERE delete_flg = '0';

DROP FUNCTION IF EXISTS public.get_sprint_available_levels(uuid[]);

CREATE OR REPLACE FUNCTION public.get_sprint_available_levels(p_content_ids uuid[])
RETURNS TABLE (
    content_id uuid,
    question_type text,
    difficulty_level smallint
) AS $$
    SELECT DISTINCT q.content_id, q.question_type, q.difficulty_level
    FROM public.com_m_sprint_questions q
    WHERE q.content_id = ANY(p_content_ids)
      AND q.delete_flg = '0'
    ORDER BY q.content_id, q.question_type, q.difficulty_level;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_sprint_available_levels(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sprint_available_levels(uuid[]) TO authenticated, service_role;

COMMIT;

-- =========================================================================
-- 【追加セクション】マッチングで作るセッションをライセンス期間内に収める
-- 追加日: 2026-10-03
--
-- 【内容】
--   fn_generate_sessions_for_schedule を更新する。各回の開始・終了日時をライセンスの開始・終了日時と
--   直接比べ、契約開始の直前の回（例: NYのコーチの火曜9:00と、水曜0:00 JST開始の契約）と
--   契約終了の直後の回を作らない。シグネチャは変更しない。
--
-- 対応ファイル: DDL/function/fn_generate_sessions_for_schedule.sql
-- 検証: testing/features/branches/feature-20261001-dev/matching-license-boundary-verify.ts
-- 【注意】既に作成済みのセッションは変更しない（ライブセッションは本番未提供のため移行は不要）。
-- =========================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_generate_sessions_for_schedule(uuid);

CREATE OR REPLACE FUNCTION public.fn_generate_sessions_for_schedule(
    p_schedule_id uuid,
    p_min_start_datetime timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_coach_tz text;
    v_cursor_date date;
    v_start_ts timestamptz;
    v_end_ts timestamptz;
    v_generated_count integer := 0;
    v_license_start timestamptz;
    v_license_end timestamptz;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    -- com_m_user.timezoneはライブ参照しない（上記【タイムゾーン変換】コメント参照）
    v_coach_tz := v_schedule.coach_timezone;

    -- 予約できる範囲（ライセンスの開始・終了日時。上記【ライセンス期間の境目】参照）
    SELECT l.start_date, l.end_date INTO v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = v_schedule.ticket_id;

    -- start_date以降で最初にday_of_weekと一致する日付を求める
    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date AND v_generated_count < v_schedule.target_sessions LOOP
        v_start_ts := (v_cursor_date + v_schedule.start_time) AT TIME ZONE v_coach_tz;
        v_end_ts := (v_cursor_date + v_schedule.end_time) AT TIME ZONE v_coach_tz;

        -- ライセンスの終了を過ぎる回に達したら打ち切る（以降の回も全て終了後）
        IF v_end_ts > v_license_end THEN
            EXIT;
        END IF;

        -- ライセンスの開始前の回はスキップする（カウントしない）
        IF v_start_ts < v_license_start THEN
            v_cursor_date := v_cursor_date + 7;
            CONTINUE;
        END IF;

        -- 24時間ルールの下限を下回る回は欠番としてスキップする（上記コメント参照）
        IF p_min_start_datetime IS NOT NULL AND v_start_ts < p_min_start_datetime THEN
            v_cursor_date := v_cursor_date + 7;
            CONTINUE;
        END IF;

        -- 当該日・当該コーチのBLOCK例外（時間帯重複）が無いことを確認
        IF NOT EXISTS (
            SELECT 1 FROM public.com_t_coach_availability_exception e
            WHERE e.coach_id = v_schedule.coach_id
              AND e.exception_date = v_cursor_date
              AND e.exception_type = 'BLOCK'
              AND e.start_time < v_schedule.end_time
              AND e.end_time > v_schedule.start_time
        ) THEN
            INSERT INTO public.com_t_session (
                schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
            ) VALUES (
                v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
                v_start_ts, v_end_ts, 1
            )
            ON CONFLICT (schedule_id, start_datetime) WHERE status = 1 DO NOTHING;

            IF FOUND THEN
                v_generated_count := v_generated_count + 1;
            END IF;
        END IF;

        v_cursor_date := v_cursor_date + 7;
    END LOOP;

    RETURN v_generated_count;
END;
$$;

-- 内部処理専用（approve_matching_request/admin_match_student_with_coach経由以外での
-- 直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_generate_sessions_for_schedule(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

COMMIT;
