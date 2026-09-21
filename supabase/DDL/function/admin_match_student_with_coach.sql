---------------------------------------------
-- アドミンによる直接マッチングRPC (2026-09-09 追加)
-- 前提: table/com_t_matching_request.sql, table/com_m_lesson_schedule.sql,
--       table/com_t_user_session_ticket.sql, table/com_t_user_license.sql,
--       function/fn_generate_sessions_for_schedule.sql,
--       function/check_coach_schedule_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 通常のマッチングは「生徒がリクエスト→コーチが承認」の2段階を経るが、アドミンの
-- ライブセッション管理画面からは、この2段階を省略していきなり成立させたい
-- （契約途中のコーチ交代直後に、生徒・コーチの操作を待たずその場で新しい担当を
-- 割り当てたいケース等）。本関数はapprove_matching_request()の承認後ロジック
-- （アドバイザリロックによる直列化、コーチの空き時間衝突チェック、
-- com_m_lesson_schedule作成、com_t_session一括生成）をそのまま踏襲しつつ、
-- 事前にpendingなcom_t_matching_requestが存在しない状態から、承認済み(status=2)の
-- リクエストを直接作成する点のみが異なる。
--
-- 同一(ticket_id, slot_no)に既にpending/approvedなリクエストが存在する場合は
-- 一意制約(uq_matching_request_active_slot)違反として失敗する
-- （呼び出し元のTypeScript側で23505を捕捉し、分かりやすいエラーメッセージに変換すること。
-- createMatchingRequestCoreの既存パターンを参照）。
--
-- 【通知】
-- 生徒へMATCHING_APPROVED、コーチへMATCHING_ASSIGNED_TO_COACHをそれぞれ通知する
-- （どちらも自ら操作していないため、双方に通知が必要）。
--
-- 【target_sessionsの確定 (2026-09-14追加)】
-- approve_matching_requestと同様、com_m_lesson_schedule.target_sessionsをここで確定する
-- （table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）。
--
-- 【権限チェック・通知の共通化 (2026-09-15追加)】
-- 権限チェックはfn_assert_actor_or_admin()、通知INSERTはfn_notify()を使う
-- （前提: function/fn_assert_actor_or_admin.sql, function/fn_notify.sql）。
--
-- 【マッチング成立処理の共通化 (2026-09-15追加)】
-- target_sessions算出〜アドバイザリロック〜空き状況チェック〜com_m_lesson_schedule作成〜
-- com_t_session一括生成は、approve_matching_request()とほぼ丸ごと重複していたため
-- fn_commit_matching_schedule()に切り出した。本関数は「承認済みのリクエストを
-- 生徒の申請・コーチの承認を経ずに直接作成する」責務のみを担い、成立処理そのものは
-- 同ヘルパーに委譲する（詳細はfunction/fn_commit_matching_schedule.sql参照）。
--
-- 【24時間ルールの対象外 (2026-09-15追加)】
-- 生徒の個別予約・振替候補・通常のマッチング承認(approve_matching_request)には
-- 「開始24時間以内は不可」ルールを適用するが、本関数はアドミンが人間同士で既に
-- 調整済みの内容を即時反映するための専用ルートのため対象外とする。そのため
-- fn_commit_matching_schedule()呼び出し時にp_min_start_datetimeを渡さない
-- （デフォルトのNULL=下限なしのまま呼ぶ）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_match_student_with_coach(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_schedule_id uuid;
    v_request_id uuid;
    v_coach_name text;
    v_student_name text;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to perform admin matching');

    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    -- 生徒の申請・コーチの承認を経ずに、承認済みのリクエストを直接作成する
    INSERT INTO public.com_t_matching_request (
        ticket_id, student_id, coach_id, slot_no, requested_day_of_week, requested_start_time, requested_end_time,
        status, responded_by, responded_at
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        2, auth.uid(), NOW()
    )
    RETURNING request_id INTO v_request_id;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request_id, p_ticket_id, v_student_id, p_coach_id,
        p_slot_no, p_day_of_week, p_start_time, p_end_time
    );

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = p_coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_student_id;

    PERFORM public.fn_notify(v_student_id, 'MATCHING_APPROVED', jsonb_build_object('coach_name', v_coach_name, 'schedule_id', v_schedule_id), '/live-room');
    PERFORM public.fn_notify(p_coach_id, 'MATCHING_ASSIGNED_TO_COACH', jsonb_build_object('student_name', v_student_name, 'schedule_id', v_schedule_id), '/students/' || v_student_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) TO authenticated;
