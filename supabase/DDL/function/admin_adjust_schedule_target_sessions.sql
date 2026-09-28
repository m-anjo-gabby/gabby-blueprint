---------------------------------------------
-- アドミンによる定期スケジュール枠のtarget_sessions個別調整RPC (2026-09-23 追加)
-- 前提: table/com_m_lesson_schedule.sql（target_sessionsパッチ）,
--       function/fn_assert_actor_or_admin.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- com_m_lesson_schedule.target_sessions は本来マッチング承認時に
-- total_sessions/weekly_frequency から確定し、以後不変という前提で運用してきたが、
-- 正当な理由がある「契約上の想定を超える追加予約」を admin が個別に認めたいケースが
-- ある。本関数はチケット全体の total_sessions には一切触れず、特定の1枠
-- (schedule_id)のtarget_sessionsのみを明示的な例外措置として引き上げる。
--
-- 【引き上げのみ許可】
-- 誤操作の訂正等での引き下げは許可しない（p_new_target_sessions <= 現在値はエラー）。
--
-- 【対象は稼働中の枠のみ】
-- 一時停止・終了済みの枠に対する調整はエラーとする。
--
-- 【生成済みセッションへの影響】
-- 本関数はtarget_sessionsの更新のみを行い、fn_generate_sessions_for_schedule()は
-- 呼び出さない（同関数は「今回の呼び出しで新規に作った行数」しかカウントしないため、
-- 既に生成済みの行を考慮できず、再実行するとtarget_sessions引き上げ分を大きく超えて
-- 過剰生成してしまう）。target_sessions引き上げ後は fn_schedule_shortfall() が
-- 自動的にshortfallを検知し、既存の「セッションを予約」(admin_book_session_direct) /
-- 「直接マッチング」(admin_match_student_with_coach) ボタンから、管理者が個々の
-- 日時を指定して追加予約する運用とする。
--
-- 【監査ログについて】
-- com_m_lesson_scheduleに適した汎用の変更履歴テーブルは存在せず（
-- com_t_user_session_ticket_historyはチケット消化専用の形状で流用不可）、直近の
-- 類似前例（契約ユーザライセンスの個別延長、2026-09-23）でも新規テーブルは追加せず
-- 単純な値更新のみとしたため、本関数もその前例を踏襲しDB側の履歴テーブルは追加しない。
-- 理由(p_reason)は必須引数として受け取り、呼び出し元TS層のログに記録することで
-- 説明責任を担保する（DBへの永続化はしない）。
--
-- 【通知なし】
-- 内部的な枠調整であり、即座の日時変更を伴わないため、他の代理操作RPCと異なり
-- fn_notify()による生徒・コーチへの通知は行わない。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_schedule_target_sessions(
    p_schedule_id uuid,
    p_new_target_sessions smallint,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to adjust target sessions');

    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason is required';
    END IF;

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'cannot adjust target_sessions on a non-active schedule slot';
    END IF;

    IF p_new_target_sessions <= v_schedule.target_sessions THEN
        RAISE EXCEPTION 'new target_sessions (%) must be greater than current (%)', p_new_target_sessions, v_schedule.target_sessions;
    END IF;

    UPDATE public.com_m_lesson_schedule
    SET target_sessions = p_new_target_sessions,
        update_date = NOW()
    WHERE schedule_id = p_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_schedule_target_sessions(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_schedule_target_sessions(uuid, smallint, text) TO authenticated;
