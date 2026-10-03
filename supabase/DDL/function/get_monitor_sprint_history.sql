---------------------------------------------
-- 3. スプリント履歴関数（セキュリティ修正版）
---------------------------------------------
-- 【2026-09-22 抜本改修】対象生徒の判定を private.get_monitor_target_users に一本化。
-- 従来は get_monitor_user_list（表示用の付随情報まで結合する重い一覧関数）を対象生徒の
-- 絞り込みだけの目的で呼び出していた。対象生徒の判定ロジック自体は private.get_monitor_target_users
-- に集約されたため、本関数はそちらを直接呼び出す（余計なJOINを避け、判定ロジックの変更も
-- 一箇所で完結する）。
-- 【2026-10-03 改修】対象期間を日付（集計期間のタイムゾーン＝日本時間の暦日）で受け取り、各回は実施した
-- 生徒のタイムゾーンでの実施日（training_date）で絞って返す（各実績は生徒のタイムゾーンでの実施日で数える。
-- testing/e2e/specs/training/training-stats.md）。引数の型が変わるため旧シグネチャを削除してから作成する。
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
