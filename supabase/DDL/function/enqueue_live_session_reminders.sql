---------------------------------------------
-- enqueue_live_session_reminders: ライブセッションのリマインダーメールを送信待ちに登録する (2026-10-06 追加)
-- enqueue_scheduled_mails: 時刻で送るメールの登録のまとめ役（pg_cron の5分ごとのジョブ・送信処理の冒頭から呼ぶ）
---------------------------------------------
-- 【対象】
-- 予定（status=1）のライブセッションの生徒とコーチ。
--
-- 【送る時刻】（グループセッション enqueue_event_reminders と同じ）
-- 開始の24時間前（'24h'）と1時間前（'1h'）。「期限が来ていて、まだ登録していないもの」を拾う。重複は一意制約で防ぐ。
--   24h … 開始の24時間前〜12時間前の間だけ登録（直前に予約・振替した回には送らない）
--   1h  … 開始の1時間前〜開始までの間だけ登録
-- キャンセル・振替（振替後は別のセッション行）・開始済みの確認は、送信処理が送る直前に最新のデータで行う（SKIPPED にする）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_live_session_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH leads(lead_key, lead_from, lead_to) AS (
        VALUES
            ('24h', INTERVAL '24 hours', INTERVAL '12 hours'),
            ('1h', INTERVAL '1 hour', INTERVAL '0 hours')
    ),
    due_sessions AS (
        SELECT s.session_id, s.student_id, s.coach_id, l.lead_key
        FROM public.com_t_session s
        JOIN leads l
          ON NOW() >= s.start_datetime - l.lead_from
         AND NOW() < s.start_datetime - l.lead_to
        WHERE s.status = 1
    ),
    recipients AS (
        SELECT session_id, lead_key, student_id AS user_id FROM due_sessions
        UNION
        SELECT session_id, lead_key, coach_id FROM due_sessions
    )
    INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
    SELECT r.user_id,
           'LIVE_SESSION_REMINDER',
           'REMINDER',
           r.session_id::text || ':' || r.lead_key,
           jsonb_build_object('session_id', r.session_id, 'lead', r.lead_key)
    FROM recipients r
    JOIN public.com_m_user u ON u.id = r.user_id AND u.delete_flg = '0'
    ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_live_session_reminders() FROM PUBLIC, anon, authenticated;

-- 時刻で送るメールの登録のまとめ役。時刻で送るメールの種類を増やすときは、ここに登録の関数を足す（cron のジョブは増やさない）
CREATE OR REPLACE FUNCTION public.enqueue_scheduled_mails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.enqueue_event_reminders() + public.enqueue_live_session_reminders();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_scheduled_mails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_scheduled_mails() TO service_role;
