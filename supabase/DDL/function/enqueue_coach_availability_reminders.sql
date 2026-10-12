---------------------------------------------
-- コーチの空き時間の見直し通知 (2026-10-06 追加)
-- 前提: table/com_m_coach_profile.sql（availability_confirmed_at パッチ）, table/com_m_coach_availability.sql,
--       table/com_t_notification.sql, function/fn_notify.sql の作成が完了していること。pg_cron が有効であること。
---------------------------------------------
-- 【背景】
-- 空き時間（com_m_coach_availability）はUTCで持つため、コーチの現地時刻での表示は夏時間の切り替えで
-- 1時間ずれる。また空き時間はコーチの生活の予定に合わせて変わる。そこで、コーチに14日ごとに
-- 空き時間を見直すようアプリ内通知で促す（メールは送らない。enqueue_notification_mail の対象外）。
--   - 空き時間が1件以上あるコーチ: 最後の確認（availability_confirmed_at）から14日を過ぎたら見直しを促す（kind = 'review'）
--   - 空き時間が0件のコーチ: 空き時間を登録するよう促す（kind = 'empty'。マッチングの申請を受けられないため）
--
-- 【通知の行】
-- 通知種別 COACH_AVAILABILITY_REMINDER、集約キー 'availability' の1行をコーチごとに使い回す
-- （再通知のたびに内容・未読・日時を更新する。一覧に同じ通知が溜まらない）。直近14日に通知した
-- コーチには出さない。空き時間を保存する・「変更なしで確認」すると、確認日時を更新し、この通知を既読にする。
--
-- 【対象のコーチ】
-- 有効なコーチ（com_m_user.user_type = '2' かつ delete_flg = '0'、プロフィールが有効）。デモコーチ
-- （demo_user ロール）は除く（通常の生徒のマッチング対象外のため。get_matchable_coach_ids と同じ考え方）。
---------------------------------------------

-- 確認日時の更新と、見直しの通知の既読化（空き時間の保存・「変更なしで確認」の共通処理。内部処理専用）
CREATE OR REPLACE FUNCTION public.fn_mark_coach_availability_confirmed(p_coach_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.com_m_coach_profile
    SET availability_confirmed_at = NOW()
    WHERE user_id = p_coach_id;

    UPDATE public.com_t_notification
    SET is_read = TRUE, read_at = NOW(), update_date = NOW()
    WHERE user_id = p_coach_id
      AND notification_type = 'COACH_AVAILABILITY_REMINDER'
      AND is_read = FALSE;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mark_coach_availability_confirmed(uuid) FROM PUBLIC, anon, authenticated;

-- 空き時間の追加・変更・削除（論理削除）のたびに確認済みにする
CREATE OR REPLACE FUNCTION public.trg_coach_availability_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.fn_mark_coach_availability_confirmed(NEW.coach_id);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_coach_availability_change_confirm ON public.com_m_coach_availability;
CREATE TRIGGER on_coach_availability_change_confirm
AFTER INSERT OR UPDATE ON public.com_m_coach_availability
FOR EACH ROW EXECUTE FUNCTION public.trg_coach_availability_confirmed();

-- 「変更なしで確認」（コーチ本人のみ）
CREATE OR REPLACE FUNCTION public.confirm_my_coach_availability()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_confirmed_at timestamptz;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.com_m_coach_profile WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'not authorized to confirm availability';
    END IF;

    PERFORM public.fn_mark_coach_availability_confirmed(auth.uid());

    SELECT availability_confirmed_at INTO v_confirmed_at FROM public.com_m_coach_profile WHERE user_id = auth.uid();
    RETURN v_confirmed_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_my_coach_availability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_my_coach_availability() TO authenticated;

-- 見直しの通知を登録する（pg_cron から毎日実行）。戻り値は通知したコーチの数
CREATE OR REPLACE FUNCTION public.enqueue_coach_availability_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH coaches AS (
        SELECT
            p.user_id AS coach_id,
            COUNT(a.availability_id) AS slot_count,
            -- 確認日時が無い（本機能の追加前から登録している）場合は、空き時間の最終更新を確認日時とみなす
            COALESCE(p.availability_confirmed_at, MAX(a.update_date)) AS confirmed_at
        FROM public.com_m_coach_profile p
        JOIN public.com_m_user u ON u.id = p.user_id AND u.user_type = '2' AND u.delete_flg = '0'
        LEFT JOIN public.com_m_coach_availability a ON a.coach_id = p.user_id AND a.delete_flg = '0'
        WHERE p.delete_flg = '0'
          AND NOT EXISTS (
              SELECT 1 FROM public.com_t_user_role r
              WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
          )
        GROUP BY p.user_id, p.availability_confirmed_at
    ),
    targets AS (
        SELECT c.coach_id, CASE WHEN c.slot_count = 0 THEN 'empty' ELSE 'review' END AS kind
        FROM coaches c
        WHERE (c.slot_count = 0 OR c.confirmed_at IS NULL OR c.confirmed_at < NOW() - interval '14 days')
          AND NOT EXISTS (
              SELECT 1 FROM public.com_t_notification n
              WHERE n.user_id = c.coach_id
                AND n.notification_type = 'COACH_AVAILABILITY_REMINDER'
                AND n.dedup_key = 'availability'
                AND n.occurred_at >= NOW() - interval '14 days'
          )
    ),
    upserted AS (
        INSERT INTO public.com_t_notification (user_id, notification_type, dedup_key, payload, link_path)
        SELECT coach_id, 'COACH_AVAILABILITY_REMINDER', 'availability', jsonb_build_object('kind', kind), '/availability'
        FROM targets
        ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE
        SET payload = EXCLUDED.payload,
            link_path = EXCLUDED.link_path,
            is_read = FALSE,
            read_at = NULL,
            occurred_at = NOW(),
            update_date = NOW()
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM upserted;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_coach_availability_reminders() FROM PUBLIC, anon, authenticated;

-- 毎日 00:15 UTC（日本 9:15、北米は前日の夕方）に実行する。同名ジョブは入れ替える（何度実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'coach-availability-reminders-daily';

SELECT cron.schedule(
    'coach-availability-reminders-daily',
    '15 0 * * *',
    $$ SELECT public.enqueue_coach_availability_reminders(); $$
);
