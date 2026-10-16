---------------------------------------------
-- enqueue_notification_mail: アプリ内通知（com_t_notification）の登録をきっかけに、通知メールを送信待ちに積む (2026-10-05 追加)
---------------------------------------------
-- 【方式】
-- 予約・キャンセル・マッチング・チャット等の出来事は、すべてアプリ内通知として com_t_notification に登録される
-- （ライブセッション関連は fn_notify、チャットは notify_chat_new_message、宿題・月次レポートは各RPC）。
-- 本トリガーで通知の登録と同じトランザクションの中で送信待ち（com_t_mail_outbox）に積むため、
-- 各RPCを変更せずに、業務データと通知メールの整合が取れる（処理が失敗すればメールも積まれない）。
-- 積んだメールは、処理の確定後に送信処理を呼んで（on_mail_outbox_inserted）すぐに送る。
--
-- 【対象】（値の正本は packages/lib/mail/dispatch/registry.ts の NOTIFICATION_MAIL_TYPES。変更する場合は両方を直す。
--   一致は単体テスト testing/unit/mail-dispatch-policy.test.ts で確かめる）
-- 宛先が生徒（user_type='1'）・コーチ（'2'）の通知のうち、下記の種別。管理者宛ては送らない。
-- 達成の通知（TRAINING_*）と、管理者の操作による通知（*_BY_ADMIN。fn_notify で登録しなくなった）は送らない。
--   mail_type='NOTIFICATION' … 通知の登録時に1通（dedup_key = notification_id）
--   mail_type='CHAT_UNREAD'  … チャットの新着。未読になった時点から10分後に送る（送る直前に既読なら送らない）。
--                              未読のまま続いた発言（同じ通知行の更新）は、同じ1通にまとめる。
--                              既読になった後の新着は新しい1通（dedup_key = notification_id:未読になった時刻）。
---------------------------------------------
CREATE OR REPLACE FUNCTION private.enqueue_notification_mail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_type text;
BEGIN
    IF NEW.is_read THEN
        RETURN NULL;
    END IF;
    IF NOT (NEW.notification_type = ANY (ARRAY[
        -- 生徒宛て
        'SESSION_CANCELLED_BY_COACH',
        'SESSION_RESCHEDULE_PROPOSED',
        'SESSION_BOOKING_APPROVED',
        'SESSION_BOOKING_REJECTED',
        'MATCHING_APPROVED',
        'MATCHING_REJECTED',
        'MATCHING_EXPIRED',
        'HOMEWORK_POSTED',
        -- コーチ宛て
        'SESSION_CANCELLED_BY_STUDENT',
        'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT',
        'SESSION_BOOKED_BY_STUDENT',
        'SESSION_BOOKING_REQUESTED',
        'MATCHING_ASSIGNED_TO_COACH',
        'MATCHING_REQUESTED',
        'COACH_REPORT_APPROVED',
        'COACH_REPORT_APPROVAL_REVOKED',
        -- 両方
        'CHAT_NEW_MESSAGE'
    ])) THEN
        RETURN NULL;
    END IF;

    SELECT user_type INTO v_user_type FROM public.com_m_user WHERE id = NEW.user_id AND delete_flg = '0';
    IF v_user_type IS NULL OR v_user_type NOT IN ('1', '2') THEN
        RETURN NULL;
    END IF;

    IF NEW.notification_type = 'CHAT_NEW_MESSAGE' THEN
        -- 未読になった時（新規・既読からの再未読）だけ積む。未読のまま続く発言は、既に積んだ1通にまとめる
        IF TG_OP = 'UPDATE' AND NOT OLD.is_read THEN
            RETURN NULL;
        END IF;
        INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload, scheduled_at)
        VALUES (
            NEW.user_id,
            'CHAT_UNREAD',
            'NOTIFICATION',
            NEW.notification_id::text || ':' || floor(extract(epoch FROM NEW.occurred_at))::bigint::text,
            jsonb_build_object('notification_id', NEW.notification_id),
            NOW() + INTERVAL '10 minutes'
        )
        ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
        VALUES (
            NEW.user_id,
            'NOTIFICATION',
            'NOTIFICATION',
            NEW.notification_id::text,
            jsonb_build_object('notification_id', NEW.notification_id)
        )
        ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.enqueue_notification_mail() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notification_enqueue_mail ON public.com_t_notification;
CREATE TRIGGER trg_notification_enqueue_mail
AFTER INSERT OR UPDATE ON public.com_t_notification
FOR EACH ROW EXECUTE FUNCTION private.enqueue_notification_mail();
