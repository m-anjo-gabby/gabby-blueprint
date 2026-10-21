---------------------------------------------
-- fn_withdraw_user: 退会（個人情報の消去）。規約は docs/DATA-DELETION.md §4
---------------------------------------------
-- 本人を特定できる情報を物理削除し、業務の記録（セッション・チケット・ライセンス・学習の集計・チャットの本文等）は
-- com_m_user の行を「退会済みユーザー」（status = 9）として残したまま匿名の実績にする。
-- 1トランザクションで DB だけを処理し、Storage のファイルと認証のアカウント（auth.users）は呼び出し元の
-- サーバーアクション（apps/admin/actions/adminWithdrawAction.ts）が、戻り値の storage のパスを使って消す。
-- 途中で失敗しても再実行で続きから終わるよう、退会済みのユーザーにも同じ削除を行う（対象が無ければ何もしない）。
--
-- 【中断する場合】（例外のメッセージで判別する）
--   user_not_found / not_withdrawable（生徒・コーチ以外）/ active_license（有効なライセンスがある）/
--   scheduled_session（今後のセッションがある）/ active_matching（回答待ちの申請・稼働中の定期予定がある）
--   ライセンスの停止・セッションのキャンセルは既存の画面で先に行う（取り消しの通知・チケットの返還をそちらに任せる）。
--
-- 【消すもの】正式氏名、お気に入り、途中再開の状態、メール設定、通知、送信待ち・送信済みのメールとその配信の記録、
--   ロール、未使用の招待、生徒について書かれたメモ、生徒の宿題（添付を含む）、コーチのプロフィール・空き時間・専門・
--   マッチングの停止設定。Webトライアルの申込は氏名・メールアドレスだけを消し、要望・知ったきっかけは残す。
-- 【残すもの】セッション・チケット・ライセンス・契約・評価の点数・研修レポート・学習の記録・チャットとセッション内の
--   チャットの本文（送信者は「退会済みユーザー」と表示）・イベントの参加の記録・規約への同意の記録。
-- service_role 専用。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_withdraw_user(p_user_id uuid, p_performed_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user          record;
    v_email         text;
    v_profile_paths text[];
    v_homework_paths text[];
    v_counts        jsonb;
    v_n             integer;
BEGIN
    SELECT id, user_type, status, icon_path INTO v_user
    FROM public.com_m_user WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;
    IF v_user.user_type NOT IN ('1', '2') THEN
        RAISE EXCEPTION 'not_withdrawable';
    END IF;

    IF EXISTS (SELECT 1 FROM public.com_t_user_license
               WHERE user_id = p_user_id AND status = 1 AND end_date > now()) THEN
        RAISE EXCEPTION 'active_license';
    END IF;
    IF EXISTS (SELECT 1 FROM public.com_t_session
               WHERE (student_id = p_user_id OR coach_id = p_user_id) AND status = 1 AND start_datetime > now()) THEN
        RAISE EXCEPTION 'scheduled_session';
    END IF;
    IF EXISTS (SELECT 1 FROM public.com_t_matching_request
               WHERE (student_id = p_user_id OR coach_id = p_user_id) AND status = 1)
       OR EXISTS (SELECT 1 FROM public.com_m_lesson_schedule
                  WHERE (student_id = p_user_id OR coach_id = p_user_id) AND status IN (0, 1)) THEN
        RAISE EXCEPTION 'active_matching';
    END IF;

    SELECT lower(email) INTO v_email FROM auth.users WHERE id = p_user_id;

    -- Storage のパス（消すのは呼び出し元）
    SELECT array_remove(ARRAY[
        v_user.icon_path,
        (SELECT intro_video_path FROM public.com_m_coach_profile WHERE user_id = p_user_id)
    ], NULL) INTO v_profile_paths;
    SELECT coalesce(array_agg(a.file_path), '{}') INTO v_homework_paths
    FROM public.com_t_session_homework_attachment a
    JOIN public.com_t_session_homework h ON h.homework_id = a.homework_id
    WHERE h.student_id = p_user_id;

    v_counts := '{}'::jsonb;

    DELETE FROM public.com_m_user_legal WHERE user_id = p_user_id;
    DELETE FROM public.com_t_favorite_contents WHERE user_id = p_user_id;
    DELETE FROM public.com_t_favorite_phrase WHERE user_id = p_user_id;
    DELETE FROM public.com_t_favorite_sprint_question WHERE user_id = p_user_id;
    DELETE FROM public.com_t_resume_contents WHERE user_id = p_user_id;
    DELETE FROM public.com_t_user_mail_setting WHERE user_id = p_user_id;
    DELETE FROM public.com_t_notification WHERE user_id = p_user_id;
    DELETE FROM public.com_t_mail_event
    WHERE mail_id IN (SELECT mail_id FROM public.com_t_mail_outbox WHERE user_id = p_user_id)
       OR (v_email IS NOT NULL AND lower(recipient) = v_email);
    DELETE FROM public.com_t_mail_outbox WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('mails', v_n);
    DELETE FROM public.com_t_user_role WHERE user_id = p_user_id;
    IF v_email IS NOT NULL THEN
        DELETE FROM public.com_t_invitation WHERE lower(email) = v_email AND accepted_at IS NULL;
    END IF;

    -- 生徒について書かれた情報
    DELETE FROM public.com_t_coach_student_note WHERE student_id = p_user_id;
    DELETE FROM public.com_t_session_homework WHERE student_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('homeworks', v_n);

    -- コーチの公開プロフィールと受付の設定
    DELETE FROM public.com_m_coach_profile WHERE user_id = p_user_id;
    DELETE FROM public.com_m_coach_availability WHERE coach_id = p_user_id;
    DELETE FROM public.com_t_coach_availability_exception WHERE coach_id = p_user_id;
    DELETE FROM public.com_m_coach_specialty_assignment WHERE coach_id = p_user_id;
    DELETE FROM public.com_m_coach_matching_suspension WHERE coach_id = p_user_id;

    -- Webトライアルの申込（要望・知ったきっかけはマーケティングのため残す）
    UPDATE public.com_t_trial_application
    SET email = 'withdrawn-' || application_id || '@invalid',
        last_name = '退会済み', first_name = '-', last_name_latin = 'Withdrawn', first_name_latin = '-',
        country_city = NULL, update_date = now()
    WHERE user_id = p_user_id AND email NOT LIKE 'withdrawn-%@invalid';

    UPDATE public.com_m_user
    SET status = 9, user_name = '退会済みユーザー', icon_path = NULL,
        login_failed_count = 0, locked_until = NULL, update_date = now()
    WHERE id = p_user_id;

    INSERT INTO public.com_t_data_deletion_log (kind, target_id, counts, performed_by)
    VALUES ('withdraw_user', p_user_id, v_counts, p_performed_by);

    RETURN jsonb_build_object(
        'counts', v_counts,
        'storage', jsonb_build_object('profile', to_jsonb(v_profile_paths), 'homework', to_jsonb(v_homework_paths))
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_withdraw_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_withdraw_user(uuid, uuid) TO service_role;
