---------------------------------------------
-- fn_purge_client: 顧客単位の一括削除（DangerZone）。規約は docs/DATA-DELETION.md §5
---------------------------------------------
-- テストデータ・営業用デモ・誤って作った顧客を、所属するユーザー・契約・ライセンス・チケット・セッション・学習の記録・
-- 招待・お知らせ・イベント・教材の限定公開の設定ごと物理削除する（戻せない）。
-- p_dry_run = true のときは何も消さず、消える件数（counts）だけを返す（画面で確認してから実行するため）。
-- 業務の記録の外部キーは RESTRICT のため、参照する側から順に消し、最後にユーザーと顧客を消す
-- （ユーザーに付属するだけのデータは CASCADE で一緒に消える）。
-- 認証のアカウント（auth.users）と Storage のファイルは、呼び出し元のサーバーアクション
-- （apps/admin/actions/adminPurgeClientAction.ts）が、戻り値の user_ids・storage を使って消す。
--
-- 【中断する場合】（例外のメッセージで判別する）
--   client_not_found / protected_client（初期テナント・Webトライアルの固定の顧客）/ has_admin（管理者が所属している）/
--   linked_to_other_client（他の顧客のユーザーとのセッション・担当関係・マッチング・評価・研修レポートがある。
--   例: この顧客のコーチが他の顧客の生徒を担当している）
-- service_role 専用。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_purge_client(p_client_id uuid, p_dry_run boolean, p_performed_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_client     record;
    v_users      uuid[];
    v_contracts  uuid[];
    v_licenses   uuid[];
    v_tickets    uuid[];
    v_rooms      uuid[];
    v_counts     jsonb;
    v_storage    jsonb;
BEGIN
    SELECT client_id, client_name, client_type INTO v_client
    FROM public.com_m_client WHERE client_id = p_client_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'client_not_found';
    END IF;
    IF v_client.client_type = 0 OR p_client_id = public.web_trial_client_id() THEN
        RAISE EXCEPTION 'protected_client';
    END IF;
    IF EXISTS (SELECT 1 FROM public.com_m_user WHERE client_id = p_client_id AND user_type = '0') THEN
        RAISE EXCEPTION 'has_admin';
    END IF;

    SELECT coalesce(array_agg(id), '{}') INTO v_users FROM public.com_m_user WHERE client_id = p_client_id;
    SELECT coalesce(array_agg(contract_id), '{}') INTO v_contracts FROM public.com_m_contract WHERE client_id = p_client_id;
    SELECT coalesce(array_agg(license_id), '{}') INTO v_licenses
    FROM public.com_t_user_license WHERE user_id = ANY (v_users) OR contract_id = ANY (v_contracts);
    SELECT coalesce(array_agg(ticket_id), '{}') INTO v_tickets
    FROM public.com_t_user_session_ticket
    WHERE user_id = ANY (v_users) OR contract_id = ANY (v_contracts) OR license_id = ANY (v_licenses);

    -- 他の顧客のユーザーとの業務の記録があれば中断する（片側だけがこの顧客のユーザー）
    IF EXISTS (SELECT 1 FROM public.com_t_session
               WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users))
                  OR (ticket_id = ANY (v_tickets) AND NOT student_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_m_coach_student_relationship
                  WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_m_lesson_schedule
                  WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_t_matching_request
                  WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_t_coach_rating
                  WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_t_contract_training_report
                  WHERE (student_id = ANY (v_users)) <> (coach_id = ANY (v_users)))
       OR EXISTS (SELECT 1 FROM public.com_t_user_license
                  WHERE contract_id = ANY (v_contracts) AND NOT user_id = ANY (v_users)) THEN
        RAISE EXCEPTION 'linked_to_other_client';
    END IF;

    v_counts := jsonb_build_object(
        'students', (SELECT count(*) FROM public.com_m_user WHERE id = ANY (v_users) AND user_type = '1'),
        'coaches', (SELECT count(*) FROM public.com_m_user WHERE id = ANY (v_users) AND user_type = '2'),
        'invitations', (SELECT count(*) FROM public.com_t_invitation
                        WHERE (client_id = p_client_id OR contract_id = ANY (v_contracts)) AND accepted_at IS NULL),
        'contracts', cardinality(v_contracts),
        'licenses', cardinality(v_licenses),
        'sessions', (SELECT count(*) FROM public.com_t_session
                     WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets)),
        'trainings', (SELECT count(*) FROM public.self_t_sprint WHERE user_id = ANY (v_users))
                     + (SELECT count(*) FROM public.self_t_word_summary WHERE user_id = ANY (v_users)),
        'chat_messages', (SELECT count(*) FROM public.com_t_chat WHERE sender_user_id = ANY (v_users)),
        'notices', (SELECT count(*) FROM public.com_m_notice WHERE client_id = p_client_id),
        'calendar_events', (SELECT count(*) FROM public.com_m_calendar_event WHERE client_id = p_client_id)
    );

    IF p_dry_run THEN
        RETURN jsonb_build_object('client_name', v_client.client_name, 'counts', v_counts);
    END IF;

    -- Storage のパス（消すのは呼び出し元）
    v_storage := jsonb_build_object(
        'profile', coalesce((
            SELECT jsonb_agg(p) FROM (
                SELECT icon_path AS p FROM public.com_m_user WHERE id = ANY (v_users) AND icon_path IS NOT NULL
                UNION ALL
                SELECT intro_video_path FROM public.com_m_coach_profile WHERE user_id = ANY (v_users) AND intro_video_path IS NOT NULL
            ) x), '[]'::jsonb),
        'homework', coalesce((
            SELECT jsonb_agg(a.file_path)
            FROM public.com_t_session_homework_attachment a
            JOIN public.com_t_session_homework h ON h.homework_id = a.homework_id
            WHERE h.student_id = ANY (v_users) OR h.coach_id = ANY (v_users)), '[]'::jsonb),
        'chat', coalesce((
            SELECT jsonb_agg(a.file_path)
            FROM public.com_t_chat_attachment a
            JOIN public.com_t_chat c ON c.chat_id = a.chat_id
            WHERE c.sender_user_id = ANY (v_users)), '[]'::jsonb)
    );
    SELECT coalesce(array_agg(DISTINCT room_id), '{}') INTO v_rooms
    FROM public.com_t_chat_room_user WHERE user_id = ANY (v_users);

    -- 業務の記録（RESTRICT の外部キーに当たらない順に）
    DELETE FROM public.com_t_coach_rating
    WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets);
    DELETE FROM public.com_t_contract_training_report
    WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets);
    DELETE FROM public.lesson_t_sprint WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users);
    DELETE FROM public.com_t_session_dialogue_log WHERE opened_by_coach_id = ANY (v_users);
    DELETE FROM public.com_t_dialogue_session_progress WHERE updated_by_coach_id = ANY (v_users);
    DELETE FROM public.com_t_dialogue_assignment WHERE student_id = ANY (v_users) OR assigned_by_coach_id = ANY (v_users);
    DELETE FROM public.com_t_session_call_log WHERE user_id = ANY (v_users);
    DELETE FROM public.com_t_session
    WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets);
    DELETE FROM public.com_m_lesson_schedule
    WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets);
    DELETE FROM public.com_t_matching_request
    WHERE student_id = ANY (v_users) OR coach_id = ANY (v_users) OR ticket_id = ANY (v_tickets);
    DELETE FROM public.com_t_coach_monthly_report_approval WHERE coach_id = ANY (v_users);
    DELETE FROM public.com_m_coach_student_relationship WHERE coach_id = ANY (v_users) OR student_id = ANY (v_users);
    DELETE FROM public.com_t_user_session_ticket_history WHERE user_id = ANY (v_users) OR contract_id = ANY (v_contracts);
    DELETE FROM public.com_t_user_session_ticket WHERE ticket_id = ANY (v_tickets);
    DELETE FROM public.com_t_user_license_history WHERE user_id = ANY (v_users) OR contract_id = ANY (v_contracts);
    DELETE FROM public.com_t_user_license WHERE license_id = ANY (v_licenses);
    DELETE FROM public.com_t_invitation WHERE client_id = p_client_id OR contract_id = ANY (v_contracts);
    DELETE FROM public.com_m_contract WHERE contract_id = ANY (v_contracts);

    -- ユーザー（付属するデータは CASCADE で消える）
    DELETE FROM public.com_t_mail_event
    WHERE mail_id IN (SELECT mail_id FROM public.com_t_mail_outbox WHERE user_id = ANY (v_users));
    DELETE FROM public.com_t_user_role WHERE user_id = ANY (v_users);
    DELETE FROM public.com_m_user WHERE id = ANY (v_users);
    -- 参加者が誰もいなくなったチャットルーム
    DELETE FROM public.com_t_chat_room r
    WHERE r.room_id = ANY (v_rooms)
      AND NOT EXISTS (SELECT 1 FROM public.com_t_chat_room_user m WHERE m.room_id = r.room_id);

    -- 顧客（お知らせ・イベント・教材の限定公開の設定は CASCADE で消える）
    DELETE FROM public.com_m_client WHERE client_id = p_client_id;

    INSERT INTO public.com_t_data_deletion_log (kind, target_id, counts, performed_by)
    VALUES ('purge_client', p_client_id, v_counts, p_performed_by);

    RETURN jsonb_build_object(
        'client_name', v_client.client_name,
        'counts', v_counts,
        'user_ids', to_jsonb(v_users),
        'storage', v_storage
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_purge_client(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_purge_client(uuid, boolean, uuid) TO service_role;
