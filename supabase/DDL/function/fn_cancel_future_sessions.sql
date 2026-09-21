---------------------------------------------
-- 未実施セッション一括キャンセル 共通ヘルパー関数 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- release_lesson_schedule_slot()（コーチ交代）とinvalidate_user_license()
-- （ライセンス無効化）は、「まだ実施されていない未来のscheduledセッションのみを
-- キャンセル扱いにする（実施済み・不参加・早期終了等の過去の記録は一切変更しない）」
-- という同一のUPDATE文を、対象範囲(schedule_id単位／ticket_id単位)とcancel_category・
-- cancel_reasonだけ変えてコピー&ペーストしていた。本関数にその部分を集約する。
--
-- 【対象範囲の指定方法】
-- p_schedule_id・p_ticket_idはどちらか一方だけを指定し、もう片方はNULLにすること
-- （呼び出し元は内部専用の2箇所のみのため、呼び出し規約の遵守は各RPC側の責務とする）。
-- release_lesson_schedule_slotは特定の1コマ(schedule_id)のみを対象とするのに対し、
-- invalidate_user_licenseは対象ライセンスに紐づく全コマ(ticket_id、週2回以上の契約では
-- 複数schedule行になり得る)を横断してキャンセルするため、スコープの単位そのものが
-- 異なる。両者を同じUPDATE文で表現するため、二者択一のフィルタとして両方受け取る。
--
-- 【チケットへの影響】
-- 本関数はcom_t_user_session_ticketには一切触れない（呼び出し元のコメント通り、
-- 未実施セッションのキャンセルはチケット消化数(used_sessions)に影響しない）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cancel_future_sessions(
    p_schedule_id uuid,
    p_ticket_id uuid,
    p_cancel_category smallint,
    p_cancel_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    IF p_schedule_id IS NULL AND p_ticket_id IS NULL THEN
        RAISE EXCEPTION 'fn_cancel_future_sessions requires either p_schedule_id or p_ticket_id';
    END IF;

    UPDATE public.com_t_session
    SET status = 3,
        cancel_category = p_cancel_category,
        cancel_reason = p_cancel_reason,
        cancelled_by = auth.uid(),
        update_date = NOW()
    WHERE status = 1 -- scheduledのみ対象（過去の実施済み・キャンセル済み等は変更しない）
      AND (
        (p_schedule_id IS NOT NULL AND schedule_id = p_schedule_id)
        OR (p_ticket_id IS NOT NULL AND ticket_id = p_ticket_id)
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cancel_future_sessions(uuid, uuid, smallint, text) FROM PUBLIC, anon, authenticated;
