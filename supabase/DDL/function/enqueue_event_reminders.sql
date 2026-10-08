---------------------------------------------
-- enqueue_event_reminders: イベント（グループセッション）のリマインダーメールを送信待ちに登録する (2026-10-05 追加)
---------------------------------------------
-- 【呼び出し元】
-- 時刻で送るメールの登録のまとめ役 enqueue_scheduled_mails（enqueue_live_session_reminders.sql）経由で、
-- pg_cron のジョブ 'mail-dispatch-every-5min'（invoke_mail_dispatch.sql）と送信処理の冒頭から実行する。
--
-- 【対象】
-- 公開中のグループセッションの参加登録者（com_t_calendar_event_participant）と
-- 担当コーチ（com_t_calendar_event_coach）。同じ人が両方に該当しても1通にする。
--
-- 【送る時刻】
-- 開始の24時間前（'24h'）と1時間前（'1h'）。「期限が来ていて、まだ登録していないもの」を拾うため、
-- 実行が1回飛んでも次の実行で取りこぼさない。重複は com_t_mail_outbox の一意制約で防ぐ。
-- ただし期限を大きく過ぎた古い案内は送らない:
--   24h … 開始の24時間前〜12時間前の間だけ登録（開始の12時間前を切ってから参加登録した人には送らない）
--   1h  … 開始の1時間前〜開始までの間だけ登録
-- 開始後・取消・参加取消の確認は、送信処理が送る直前に最新のデータで行う（SKIPPED にする）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_event_reminders()
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
    due_events AS (
        SELECT e.calendar_event_id, l.lead_key
        FROM public.com_m_calendar_event e
        JOIN leads l
          ON NOW() >= e.start_datetime - l.lead_from
         AND NOW() < e.start_datetime - l.lead_to
        WHERE e.event_type = 'GROUP_SESSION'
          AND e.is_published = TRUE
          AND e.delete_flg = '0'
    ),
    recipients AS (
        SELECT d.calendar_event_id, d.lead_key, p.user_id
        FROM due_events d
        JOIN public.com_t_calendar_event_participant p ON p.calendar_event_id = d.calendar_event_id
        UNION
        SELECT d.calendar_event_id, d.lead_key, c.coach_id
        FROM due_events d
        JOIN public.com_t_calendar_event_coach c ON c.calendar_event_id = d.calendar_event_id
    )
    INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
    SELECT r.user_id,
           'GROUP_SESSION_REMINDER',
           'REMINDER',
           r.calendar_event_id::text || ':' || r.lead_key,
           jsonb_build_object('calendar_event_id', r.calendar_event_id, 'lead', r.lead_key)
    FROM recipients r
    JOIN public.com_m_user u ON u.id = r.user_id AND u.delete_flg = '0'
    ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_event_reminders() FROM PUBLIC, anon, authenticated;
