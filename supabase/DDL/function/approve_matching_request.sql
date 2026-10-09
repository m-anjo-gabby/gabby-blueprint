---------------------------------------------
-- マッチングリクエスト承認RPC (2026-08-15 追加)
-- 前提: table/com_t_matching_request.sql, table/com_m_lesson_schedule.sql,
--       table/com_t_user_session_ticket.sql, table/com_t_user_license.sql,
--       function/fn_generate_sessions_for_schedule.sql,
--       function/fn_matching_slot_availability.sql,
--       function/fn_assert_actor_or_admin.sql, function/fn_notify.sql,
--       function/fn_commit_matching_schedule.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチがマッチングリクエストを承認する唯一の入口。
-- com_t_matching_request への直接UPDATEはRLSで許可していないため、
-- 承認処理（ステータス更新 + com_m_lesson_schedule作成 + com_t_session一括生成）は
-- 必ず本関数を通す。SECURITY DEFINERにより、内部のテーブル操作はRLSをバイパスするが、
-- 呼び出し元が宛先コーチ本人（またはadmin）であることは関数内で明示的に検証する。
--
-- 【二重予約防止 (2026-09-03 追加)】
-- 申請時(createMatchingRequestCore)にも同一の判定（2026-10-09から fn_matching_slot_availability()）でチェックを
-- 行うが、申請〜承認の間に別の申請が先に承認される競合（TOCTOU）は申請時チェックだけでは
-- 防げない。そのため承認時にも必ず同じ関数で再チェックする。
-- 加えて、ほぼ同時に別々の承認処理（異なるrequest_id、同一コーチ×同一曜日）が走った場合、
-- どちらも重複チェック時点ではまだ相手のcom_m_lesson_schedule行が存在せず、チェックを
-- すり抜けてしまうレース条件が起こり得る。これを防ぐため、重複チェックの前に対象
-- (coach_id, day_of_week)単位のトランザクションアドバイザリロックを取得し、同一コーチ×
-- 同一曜日への承認処理を直列化する（コミット/ロールバックで自動解放。本関数内で取得する
-- ロックは常にこの1本のみのため、デッドロックの起こりようがない）。
--
-- 【通知 (2026-09-09追加)】
-- 承認完了時、生徒へマッチング成立を通知する(MATCHING_APPROVED)。コーチは自ら承認操作を
-- 行っているため通知不要。
--
-- 【target_sessionsの確定 (2026-09-14追加)】
-- com_m_lesson_schedule.target_sessions（このコマが契約上持つべき目標セッション数）を、
-- 対象チケットのtotal_sessions/weekly_frequencyから算出しここで確定する（table/
-- com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）。承認が契約開始から遅れても
-- 目標値自体は変わらないため、fn_generate_sessions_for_schedule()の生成上限、
-- fn_schedule_shortfall()の期待値が正しく契約のエンタイトルメントを反映するようになる。
--
-- 【権限チェック・通知の共通化 (2026-09-15追加)】
-- 権限チェックはfn_assert_actor_or_admin()、通知INSERTはfn_notify()にそれぞれ集約する
-- （複数のRPCに渡ってコピー&ペーストされていたパターンの共通化。詳細は各関数の
-- ファイル自身のコメント参照）。
--
-- 【マッチング成立処理の共通化 (2026-09-15追加)】
-- target_sessions算出〜アドバイザリロック〜空き状況チェック〜com_m_lesson_schedule作成〜
-- com_t_session一括生成は、admin_match_student_with_coach()とほぼ丸ごと重複していたため
-- fn_commit_matching_schedule()に切り出した。本関数は「pendingなリクエストを承認済みに
-- 更新する」責務のみを担い、成立処理そのものは同ヘルパーに委譲する
-- （詳細はfunction/fn_commit_matching_schedule.sql参照）。
--
-- 【24時間ルールの適用 (2026-09-15追加)】
-- 生徒の個別予約・振替候補と同様、コーチ自身の承認によるマッチング成立でも、承認した
-- その日のうちに開始してしまう初回セッションが生成され得る（曜日パターンの都合）。
-- コーチ本人の承認には24時間ルールを適用し、下限を下回る回はfn_generate_sessions_for_schedule()側で
-- 欠番としてスキップさせる。アドミンが本関数を代理承認する場合（get_jwt_user_type()='0'）は、
-- admin_match_student_with_coach()と同様このルールの対象外とする。
--
-- 【基準のタイムゾーン (2026-10-06追加)】
-- 申請の曜日・時刻は生徒の申請時のタイムゾーン（requested_timezone）の現地時刻のため、そのタイムゾーンを
-- fn_commit_matching_schedule() に渡し、定期スケジュール・セッションを生徒側の時刻で作る。
--
-- 【予約できた回数の通知 (2026-10-09追加)】
-- 予約できる回数が割合以上なら、他の予定と重なる回を飛ばして成立する（fn_commit_matching_schedule 参照）。
-- 生徒への成立通知に、予約できた回数（booked_sessions）とコマの回数（target_sessions）を入れ、
-- 未予約の回が残る場合は個別の調整を案内する。
--
-- 【回答期限 (2026-10-09追加)】
-- 回答期限（expires_at。申請から24時間）を過ぎた申請は EXPIRED で拒否する（期限切れの処理は expire_matching_requests.sql）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_matching_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_schedule_id uuid;
    v_coach_name text;
    v_min_start_datetime timestamptz;
    v_target_sessions integer;
    v_booked_sessions integer;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to approve this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    -- 回答期限（expires_at）を過ぎた承認待ちは、期限切れの処理（毎分）を待たずに無効として扱う
    IF v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW() THEN
        RAISE EXCEPTION 'EXPIRED: matching request % has expired', p_request_id;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    -- アドミン代理承認は24時間ルールの対象外（admin_match_student_with_coach()と同様）
    IF public.get_jwt_user_type() = '0' THEN
        v_min_start_datetime := NULL;
    ELSE
        v_min_start_datetime := NOW() + interval '24 hours';
    END IF;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request.request_id, v_request.ticket_id, v_request.student_id, v_request.coach_id,
        v_request.slot_no, v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_request.requested_timezone, v_min_start_datetime
    );

    SELECT target_sessions INTO v_target_sessions FROM public.com_m_lesson_schedule WHERE schedule_id = v_schedule_id;
    SELECT COUNT(*) INTO v_booked_sessions FROM public.com_t_session WHERE schedule_id = v_schedule_id AND status = 1;

    -- 生徒へ、マッチング成立を通知する（コーチは自ら承認操作を行ったため通知不要）
    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_APPROVED',
        jsonb_build_object(
            'coach_name', v_coach_name, 'schedule_id', v_schedule_id,
            'booked_sessions', v_booked_sessions, 'target_sessions', v_target_sessions
        ),
        '/live-room'
    );

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;
