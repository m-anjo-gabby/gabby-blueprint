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

-- =========================================================================
-- 【追加セクション】アプリのみ契約の生徒のスプリントのレベル管理をオフにする
-- 追加日: 2026-10-03
--
-- 【内容】
--   レベル管理（到達レベル＋1まで）はコーチが定期的に引き上げるライブセッション付き契約だけで行い、
--   コーチのいない契約（アプリのみ）の生徒は全レベルを選べるようにする（実績に応じた自動の引き上げは将来対応）。
--   新しい生徒はアプリ側（packages/lib/license/issue.ts の初期ライセンス発行）で契約の種類から設定する。
--   本セクションは既存の生徒を一度だけ揃える: ライブセッション付き契約のライセンスを1件も持たない生徒をオフにする。
--
-- 対応ファイル: DDL/table/student_m_sprint_progress.sql（末尾の追加パッチ節）
-- 【注意】先頭のセクション（level_managed 列の追加）の後に適用すること。再実行しても結果は変わらない。
-- =========================================================================

BEGIN;

UPDATE public.student_m_sprint_progress p
SET level_managed = false
WHERE p.level_managed
  AND NOT EXISTS (
    SELECT 1
    FROM public.com_t_user_license l
    JOIN public.com_m_contract c ON c.contract_id = l.contract_id
    WHERE l.user_id = p.user_id
      AND c.contract_type = 2
  );

COMMIT;

-- =========================================================================
-- 【追加セクション】トレーニング記録のスプリントセッションを生徒のタイムゾーンの月で集計する
-- 追加日: 2026-10-03
--
-- 【内容】
--   get_user_training_performance を更新する。スプリントセッション（self_t_sprint、日時はUTC）を
--   UTCの月の範囲ではなく、生徒のタイムゾーンでの日付で月に絞る（例: 日本時間 10/1 8:00 の回を9月ではなく10月に数える）。
--   シグネチャは変更しない。
--
-- 対応ファイル: DDL/function/get_user_training_performance.sql
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_training_performance(
    _year_month TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_id UUID := auth.uid();
    _start_date DATE;
    _end_date DATE;
    _words_json JSONB;
    _sessions_json JSONB;
    _drills_json JSONB;
    _timezone TEXT;
BEGIN
    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- 月の開始日と終了日を計算
    _start_date := (_year_month || '-01')::DATE;
    _end_date := (_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    -- スプリントセッションは日時（UTC）で保存されているため、生徒のタイムゾーンでの日付で月を絞る
    -- （日次サマリーの training_date は記録時点のタイムゾーンでの日付で確定済み）
    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO _timezone
    FROM public.com_m_user
    WHERE id = _user_id;
    _timezone := COALESCE(_timezone, 'Asia/Tokyo');

    -- 1. 単語ドリル履歴の取得
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'content_id', w.content_id,
        'training_date', w.training_date,
        'word_count', w.word_count,
        'phrase_count', w.phrase_count,
        'assessment_count', w.assessment_count,
        'update_date', w.update_date,
        'content_name', COALESCE(c.content_name, 'Training')
    )), '[]'::jsonb) INTO _words_json
    FROM public.self_t_word_summary w
    LEFT JOIN public.com_m_contents c ON c.content_id = w.content_id
    WHERE w.user_id = _user_id
      AND w.training_date BETWEEN _start_date AND _end_date;

    -- 2. スプリントセッション履歴の取得 (assessment_count を total_assessments から直接取得)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'self_sprint_id', s.self_sprint_id,
        'content_id', s.content_id,
        'total_answered', s.total_answered,
        'insert_date', s.insert_date,
        'assessment_count', s.total_assessments
    )), '[]'::jsonb) INTO _sessions_json
    FROM public.self_t_sprint s
    WHERE s.user_id = _user_id
      AND (s.insert_date AT TIME ZONE _timezone)::DATE BETWEEN _start_date AND _end_date;

    -- 3. スプリントドリル履歴の取得
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'summary_id', d.summary_id,
        'content_id', d.content_id,
        'training_date', d.training_date,
        'question_count', d.question_count,
        'assessment_count', d.assessment_count
    )), '[]'::jsonb) INTO _drills_json
    FROM public.self_t_sprint_summary d
    WHERE d.user_id = _user_id
      AND d.training_date BETWEEN _start_date AND _end_date;

    RETURN jsonb_build_object(
        'words', _words_json,
        'sprint_sessions', _sessions_json,
        'sprint_drills', _drills_json
    );
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_user_training_performance(TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_user_training_performance(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_user_training_performance(TEXT) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】トレーニングレポートにスプリントのセッションの実績を含める
-- 追加日: 2026-10-03
--
-- 【内容】
--   get_training_report_data を更新する。学習日数・スプリント問題数・発話評価の回数に、スプリントの
--   セッション（制限時間あり。self_t_sprint）の実績を含める（これまでは単語帳・ドリルの日次サマリーだけ）。
--   セッションの日付は実施日時を生徒のタイムゾーンでの日付にし、ライセンス期間の日本時間の日付範囲で絞る。
--   スプリント問題数はドリルの問題数＋セッションの回答数。シグネチャは変更しない。
--
-- 対応ファイル: DDL/function/get_training_report_data.sql
-- =========================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_training_report_data(uuid[]);

CREATE OR REPLACE FUNCTION public.get_training_report_data(p_license_ids uuid[])
RETURNS jsonb AS $$
    WITH lic AS (
        SELECT
            l.license_id, l.user_id, l.status, l.start_date, l.end_date,
            (l.start_date AT TIME ZONE 'Asia/Tokyo')::date AS from_date,
            (l.end_date AT TIME ZONE 'Asia/Tokyo')::date AS to_date,
            LEAST(l.end_date, NOW()) AS level_end_at,
            u.user_name,
            COALESCE(u.timezone, 'Asia/Tokyo') AS timezone,
            c.contract_id, c.contract_name, c.plan_name, cl.client_name,
            t.ticket_id, t.total_sessions
        FROM public.com_t_user_license l
        JOIN public.com_m_user u ON u.id = l.user_id
        JOIN public.com_m_contract c ON c.contract_id = l.contract_id
        JOIN public.com_m_client cl ON cl.client_id = c.client_id
        LEFT JOIN public.com_t_user_session_ticket t ON t.license_id = l.license_id
        WHERE l.license_id = ANY(p_license_ids)
    ),
    daily AS (
        SELECT
            lic.license_id,
            d.training_date,
            SUM(d.words)::integer AS words,
            SUM(d.phrases)::integer AS phrases,
            SUM(d.sprint_questions)::integer AS sprint_questions,
            SUM(d.assessments)::integer AS assessments
        FROM lic
        CROSS JOIN LATERAL (
            SELECT w.training_date, w.word_count AS words, w.phrase_count AS phrases,
                   0 AS sprint_questions, w.assessment_count AS assessments
            FROM public.self_t_word_summary w
            WHERE w.user_id = lic.user_id AND w.training_date BETWEEN lic.from_date AND lic.to_date
            UNION ALL
            SELECT s.training_date, 0, 0, s.question_count, s.assessment_count
            FROM public.self_t_sprint_summary s
            WHERE s.user_id = lic.user_id AND s.training_date BETWEEN lic.from_date AND lic.to_date
            UNION ALL
            SELECT (ss.insert_date AT TIME ZONE lic.timezone)::date, 0, 0, ss.total_answered, ss.total_assessments
            FROM public.self_t_sprint ss
            WHERE ss.user_id = lic.user_id
              AND (ss.insert_date AT TIME ZONE lic.timezone)::date BETWEEN lic.from_date AND lic.to_date
        ) d
        GROUP BY lic.license_id, d.training_date
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'license_id', lic.license_id,
            'license_status', lic.status,
            'start_date', lic.start_date,
            'end_date', lic.end_date,
            'student_id', lic.user_id,
            'student_name', lic.user_name,
            'contract_id', lic.contract_id,
            'contract_name', lic.contract_name,
            'plan_name', lic.plan_name,
            'client_name', lic.client_name,
            'levels_start', jsonb_build_object(
                '0', public.get_sprint_level_as_of(lic.user_id, 0::smallint, lic.start_date),
                '4', public.get_sprint_level_as_of(lic.user_id, 4::smallint, lic.start_date),
                '5', public.get_sprint_level_as_of(lic.user_id, 5::smallint, lic.start_date),
                '6', public.get_sprint_level_as_of(lic.user_id, 6::smallint, lic.start_date)
            ),
            'levels_end', jsonb_build_object(
                '0', public.get_sprint_level_as_of(lic.user_id, 0::smallint, lic.level_end_at),
                '4', public.get_sprint_level_as_of(lic.user_id, 4::smallint, lic.level_end_at),
                '5', public.get_sprint_level_as_of(lic.user_id, 5::smallint, lic.level_end_at),
                '6', public.get_sprint_level_as_of(lic.user_id, 6::smallint, lic.level_end_at)
            ),
            'activity', (
                SELECT jsonb_build_object(
                    'active_days', COUNT(*)::integer,
                    'words', COALESCE(SUM(daily.words), 0)::integer,
                    'phrases', COALESCE(SUM(daily.phrases), 0)::integer,
                    'sprint_questions', COALESCE(SUM(daily.sprint_questions), 0)::integer,
                    'assessments', COALESCE(SUM(daily.assessments), 0)::integer
                )
                FROM daily WHERE daily.license_id = lic.license_id
            ),
            'monthly', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'month', m.month,
                    'active_days', m.active_days,
                    'words', m.words,
                    'phrases', m.phrases,
                    'sprint_questions', m.sprint_questions
                ) ORDER BY m.month), '[]'::jsonb)
                FROM (
                    SELECT to_char(daily.training_date, 'YYYY-MM') AS month,
                           COUNT(*)::integer AS active_days,
                           SUM(daily.words)::integer AS words,
                           SUM(daily.phrases)::integer AS phrases,
                           SUM(daily.sprint_questions)::integer AS sprint_questions
                    FROM daily WHERE daily.license_id = lic.license_id
                    GROUP BY 1
                ) m
            ),
            'live', CASE WHEN lic.ticket_id IS NULL THEN NULL ELSE (
                SELECT jsonb_build_object(
                    'total_sessions', lic.total_sessions,
                    'completed', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result IN (1, 2))::integer,
                    'no_show', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result = 3)::integer,
                    'late_cancel', COUNT(*) FILTER (WHERE s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded IS FALSE)::integer
                )
                FROM public.com_t_session s
                WHERE s.ticket_id = lic.ticket_id
            ) END,
            'comments', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'coach_name', cu.user_name,
                    'status', r.status,
                    'comment_text', r.comment_text,
                    'finalized_at', r.finalized_at
                ) ORDER BY r.insert_date), '[]'::jsonb)
                FROM public.com_t_contract_training_report r
                JOIN public.com_m_user cu ON cu.id = r.coach_id
                WHERE r.ticket_id = lic.ticket_id
            )
        )
        ORDER BY lic.user_name
    ), '[]'::jsonb)
    FROM lic;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_training_report_data(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_report_data(uuid[]) TO service_role;

COMMIT;

-- =========================================================================
-- 【追加セクション】集計期間のタイムゾーンを1か所にまとめ、モニターの期間を日本時間で区切る
-- 追加日: 2026-10-03
--
-- 【内容】
--   集計期間（モニターの対象月・期間、対象生徒の判定、トレーニングレポートの契約期間）は日本時間で区切り、
--   各実績の日付は生徒のタイムゾーンでの実施日で数える。
--   1. public.reporting_timezone() を新規作成（集計期間のタイムゾーン。'Asia/Tokyo'）
--   2. private.get_monitor_target_users: ライセンス期間との重なりを、UTCの0時ではなく日本時間の暦日で判定する
--      （例: 9/1 0:00 JST 開始の契約の受講生が8月の一覧に出ない）
--   3. get_monitor_sprint_history: 引数を日付に変更（旧シグネチャを削除して作成）。各回を実施した生徒の
--      タイムゾーンでの実施日（training_date を返す）で絞る
--   4. get_training_report_data: 契約期間の日本時間を 1 の関数から使う（結果は変わらない）
--
-- 対応ファイル: DDL/function/reporting_timezone.sql, get_monitor_target_users.sql,
--   get_monitor_sprint_history.sql, get_training_report_data.sql
-- 【注意】3 は旧アプリの呼び出し（終了日に 'YYYY-MM-DDT23:59:59.999Z' を渡す）も日付として受け付けるため、
--   アプリより先に適用してよい。
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reporting_timezone()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'Asia/Tokyo'::text $$;

COMMENT ON FUNCTION public.reporting_timezone() IS '集計期間（モニター・トレーニングレポート）を区切るタイムゾーン。アプリ側は packages/lib/date/reporting.ts';

CREATE OR REPLACE FUNCTION private.get_monitor_target_users(
    _client_id UUID,
    _start_date DATE,
    _end_date DATE,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    user_id UUID,
    contract_id UUID,
    license_id UUID,
    license_status SMALLINT,
    license_start_date TIMESTAMPTZ,
    license_end_date TIMESTAMPTZ,
    plan_name TEXT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT DISTINCT ON (u.id)
      u.id AS user_id,
      l.contract_id,
      l.license_id,
      l.status AS license_status,
      l.start_date AS license_start_date,
      l.end_date AS license_end_date,
      con.plan_name
    FROM public.com_m_user u
    INNER JOIN public.com_t_user_license l
      ON l.user_id = u.id
     AND l.status = 1 -- 💡 有効なライセンスのみを対象とする（停止・満了は日付が重なっていても除外）
     -- 対象期間の日付は集計期間のタイムゾーン（日本時間）の暦日。終了日いっぱいまでを含める
     AND l.start_date < ((_end_date + 1)::timestamp AT TIME ZONE public.reporting_timezone())
     AND l.end_date >= (_start_date::timestamp AT TIME ZONE public.reporting_timezone())
    LEFT JOIN public.com_m_contract con ON con.contract_id = l.contract_id
    WHERE u.client_id = _client_id
      AND u.user_type ~ '1'
      -- 💡 デモユーザーはどんな時でも絶対に含めない
      AND NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = u.id AND r.role_id = 'demo_user'
      )
      -- 💡 モニターロールの切り替えロジック
      AND (
        _include_monitor = TRUE -- ONならモニターロールの人も通過させる
        OR
        NOT EXISTS ( -- OFFならモニターロールの人も弾く（通常表示）
          SELECT 1 FROM public.com_t_user_role r
          WHERE r.user_id = u.id AND r.role_id = 'monitor'
        )
      )
    ORDER BY
      u.id,
      -- 対象期間内での重なりが最大のライセンスを代表として採用
      LEAST(l.end_date, (_end_date + 1)::timestamp AT TIME ZONE public.reporting_timezone())
        - GREATEST(l.start_date, _start_date::timestamp AT TIME ZONE public.reporting_timezone()) DESC,
      l.end_date DESC;
$$;

-- 🚨 内部ヘルパーのため外部公開しない（SECURITY DEFINER関数の内部からのみ呼び出される）
REVOKE ALL ON FUNCTION private.get_monitor_target_users(UUID, DATE, DATE, BOOLEAN) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.get_monitor_sprint_history(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID[], BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_monitor_sprint_history(
    _start_date DATE,
    _end_date DATE,
    _user_ids UUID[] DEFAULT NULL,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    RETURN QUERY
    WITH target_users AS (
        SELECT t.user_id FROM private.get_monitor_target_users(_client_id, _start_date, _end_date, _include_monitor) t
        WHERE (_user_ids IS NULL OR cardinality(_user_ids) = 0 OR t.user_id = ANY(_user_ids))
    )
    SELECT jsonb_build_object(
        'self_sprint_id', s.self_sprint_id,
        'user_id', s.user_id,
        'sprint_type', s.sprint_type,
        'content_id', s.content_id,
        'question_type', s.question_type,
        'answer_type', s.answer_type,
        'difficulty_level', s.difficulty_level,
        'time_limit_sec', s.time_limit_sec,
        'total_answered', s.total_answered,
        'total_assessments', s.total_assessments,
        'insert_date', s.insert_date,
        'training_date', (s.insert_date AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date,
        'content_name', c.content_name,
        'user_name', u.user_name,
        'email', au.email
    )
    FROM public.self_t_sprint s
    INNER JOIN target_users tu ON tu.user_id = s.user_id
    INNER JOIN public.com_m_user u ON u.id = s.user_id
    INNER JOIN auth.users au ON au.id = u.id
    LEFT JOIN public.com_m_contents c ON c.content_id = s.content_id
    -- 前後1日広げた範囲で索引を使って絞り込み、生徒のタイムゾーンでの実施日で対象期間に合わせる
    WHERE s.insert_date >= (_start_date - 1)::timestamptz
      AND s.insert_date < (_end_date + 2)::timestamptz
      AND (s.insert_date AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date BETWEEN _start_date AND _end_date
    ORDER BY s.insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_sprint_history(DATE, DATE, UUID[], BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_sprint_history(DATE, DATE, UUID[], BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_sprint_history(DATE, DATE, UUID[], BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS public.get_training_report_data(uuid[]);

CREATE OR REPLACE FUNCTION public.get_training_report_data(p_license_ids uuid[])
RETURNS jsonb AS $$
    WITH lic AS (
        SELECT
            l.license_id, l.user_id, l.status, l.start_date, l.end_date,
            (l.start_date AT TIME ZONE public.reporting_timezone())::date AS from_date,
            (l.end_date AT TIME ZONE public.reporting_timezone())::date AS to_date,
            LEAST(l.end_date, NOW()) AS level_end_at,
            u.user_name,
            COALESCE(u.timezone, 'Asia/Tokyo') AS timezone,
            c.contract_id, c.contract_name, c.plan_name, cl.client_name,
            t.ticket_id, t.total_sessions
        FROM public.com_t_user_license l
        JOIN public.com_m_user u ON u.id = l.user_id
        JOIN public.com_m_contract c ON c.contract_id = l.contract_id
        JOIN public.com_m_client cl ON cl.client_id = c.client_id
        LEFT JOIN public.com_t_user_session_ticket t ON t.license_id = l.license_id
        WHERE l.license_id = ANY(p_license_ids)
    ),
    daily AS (
        SELECT
            lic.license_id,
            d.training_date,
            SUM(d.words)::integer AS words,
            SUM(d.phrases)::integer AS phrases,
            SUM(d.sprint_questions)::integer AS sprint_questions,
            SUM(d.assessments)::integer AS assessments
        FROM lic
        CROSS JOIN LATERAL (
            SELECT w.training_date, w.word_count AS words, w.phrase_count AS phrases,
                   0 AS sprint_questions, w.assessment_count AS assessments
            FROM public.self_t_word_summary w
            WHERE w.user_id = lic.user_id AND w.training_date BETWEEN lic.from_date AND lic.to_date
            UNION ALL
            SELECT s.training_date, 0, 0, s.question_count, s.assessment_count
            FROM public.self_t_sprint_summary s
            WHERE s.user_id = lic.user_id AND s.training_date BETWEEN lic.from_date AND lic.to_date
            UNION ALL
            SELECT (ss.insert_date AT TIME ZONE lic.timezone)::date, 0, 0, ss.total_answered, ss.total_assessments
            FROM public.self_t_sprint ss
            WHERE ss.user_id = lic.user_id
              AND (ss.insert_date AT TIME ZONE lic.timezone)::date BETWEEN lic.from_date AND lic.to_date
        ) d
        GROUP BY lic.license_id, d.training_date
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'license_id', lic.license_id,
            'license_status', lic.status,
            'start_date', lic.start_date,
            'end_date', lic.end_date,
            'student_id', lic.user_id,
            'student_name', lic.user_name,
            'contract_id', lic.contract_id,
            'contract_name', lic.contract_name,
            'plan_name', lic.plan_name,
            'client_name', lic.client_name,
            'levels_start', jsonb_build_object(
                '0', public.get_sprint_level_as_of(lic.user_id, 0::smallint, lic.start_date),
                '4', public.get_sprint_level_as_of(lic.user_id, 4::smallint, lic.start_date),
                '5', public.get_sprint_level_as_of(lic.user_id, 5::smallint, lic.start_date),
                '6', public.get_sprint_level_as_of(lic.user_id, 6::smallint, lic.start_date)
            ),
            'levels_end', jsonb_build_object(
                '0', public.get_sprint_level_as_of(lic.user_id, 0::smallint, lic.level_end_at),
                '4', public.get_sprint_level_as_of(lic.user_id, 4::smallint, lic.level_end_at),
                '5', public.get_sprint_level_as_of(lic.user_id, 5::smallint, lic.level_end_at),
                '6', public.get_sprint_level_as_of(lic.user_id, 6::smallint, lic.level_end_at)
            ),
            'activity', (
                SELECT jsonb_build_object(
                    'active_days', COUNT(*)::integer,
                    'words', COALESCE(SUM(daily.words), 0)::integer,
                    'phrases', COALESCE(SUM(daily.phrases), 0)::integer,
                    'sprint_questions', COALESCE(SUM(daily.sprint_questions), 0)::integer,
                    'assessments', COALESCE(SUM(daily.assessments), 0)::integer
                )
                FROM daily WHERE daily.license_id = lic.license_id
            ),
            'monthly', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'month', m.month,
                    'active_days', m.active_days,
                    'words', m.words,
                    'phrases', m.phrases,
                    'sprint_questions', m.sprint_questions
                ) ORDER BY m.month), '[]'::jsonb)
                FROM (
                    SELECT to_char(daily.training_date, 'YYYY-MM') AS month,
                           COUNT(*)::integer AS active_days,
                           SUM(daily.words)::integer AS words,
                           SUM(daily.phrases)::integer AS phrases,
                           SUM(daily.sprint_questions)::integer AS sprint_questions
                    FROM daily WHERE daily.license_id = lic.license_id
                    GROUP BY 1
                ) m
            ),
            'live', CASE WHEN lic.ticket_id IS NULL THEN NULL ELSE (
                SELECT jsonb_build_object(
                    'total_sessions', lic.total_sessions,
                    'completed', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result IN (1, 2))::integer,
                    'no_show', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result = 3)::integer,
                    'late_cancel', COUNT(*) FILTER (WHERE s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded IS FALSE)::integer
                )
                FROM public.com_t_session s
                WHERE s.ticket_id = lic.ticket_id
            ) END,
            'comments', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'coach_name', cu.user_name,
                    'status', r.status,
                    'comment_text', r.comment_text,
                    'finalized_at', r.finalized_at
                ) ORDER BY r.insert_date), '[]'::jsonb)
                FROM public.com_t_contract_training_report r
                JOIN public.com_m_user cu ON cu.id = r.coach_id
                WHERE r.ticket_id = lic.ticket_id
            )
        )
        ORDER BY lic.user_name
    ), '[]'::jsonb)
    FROM lic;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_training_report_data(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_report_data(uuid[]) TO service_role;

COMMIT;
