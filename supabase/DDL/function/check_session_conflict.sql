---------------------------------------------
-- コーチ・生徒それぞれのダブルブッキング有無を返す共通ヘルパー関数 (2026-09-11 追加)
-- 前提: table/com_t_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 個別セッション予約からコーチのAvailability制約を撤廃し自由に日時選択できるように
-- する代わりに、ダブルブッキングの実害はこの関数による事前・承認時チェックで防ぐ。
-- 従来 cancel_session() / reschedule_session() / book_makeup_session() /
-- accept_session_reschedule_proposal() の4箇所に重複実装されていたチェックを本関数に
-- 統合し、かつ以下の用途で共用する。
--   1. 上記RPC内部から呼び出す、サーバー側の最終防衛ライン
--   2. クライアントの日時入力中に直接呼び出す、インラインエラー表示用の事前チェック
--      （候補提案の入力・自由日時での予約リクエスト入力のいずれでも使う）
--
-- 呼び出し者は対象のコーチ・生徒本人、または管理者のみに限定する
-- （無関係の第三者が他人の予定の有無を探索できないようにするため）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.check_session_conflict(
    p_coach_id uuid,
    p_student_id uuid,
    p_start_datetime timestamptz,
    p_end_datetime timestamptz,
    p_exclude_session_id uuid DEFAULT NULL
)
RETURNS TABLE(coach_conflict boolean, student_conflict boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() NOT IN (p_coach_id, p_student_id) AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to check this schedule';
    END IF;

    RETURN QUERY SELECT
        EXISTS (
            SELECT 1 FROM public.com_t_session s
            WHERE s.coach_id = p_coach_id
              AND s.status = 1
              AND (p_exclude_session_id IS NULL OR s.session_id <> p_exclude_session_id)
              AND s.start_datetime < p_end_datetime
              AND s.end_datetime > p_start_datetime
        ),
        EXISTS (
            SELECT 1 FROM public.com_t_session s
            WHERE s.student_id = p_student_id
              AND s.status = 1
              AND (p_exclude_session_id IS NULL OR s.session_id <> p_exclude_session_id)
              AND s.start_datetime < p_end_datetime
              AND s.end_datetime > p_start_datetime
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_session_conflict(uuid, uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_session_conflict(uuid, uuid, timestamptz, timestamptz, uuid) TO authenticated;
