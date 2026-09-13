-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260911-dev
-- 作成日: 2026-09-11
-- 更新日: 2026-09-13（月次コーチングレポート: 一覧の対象行を「実績としてカウントする、または
--          要対応(終了処理未実施)」の行のみに絞り込むよう一般化。詳細はファイル末尾の
--          「19. 月次コーチングレポート: 対象行の絞り込みを一般化」セクションのコメントを参照）
-- 更新日: 2026-09-13（月次コーチングレポート: 未来の予定(未実施)セッションを一覧から除外する
--          よう修正。詳細はファイル末尾の「18. 月次コーチングレポート: 未来の予定セッションの
--          除外」セクションのコメントを参照）
-- 更新日: 2026-09-13（月次コーチングレポート: 終了処理未実施セッションが残る月の承認を拒否
--          するよう修正。詳細はファイル末尾の「17. 月次コーチングレポート: 終了処理未実施
--          セッションの承認ブロック」セクションのコメントを参照）
-- 更新日: 2026-09-13（月次コーチングレポートの月範囲判定をコーチのタイムゾーン基準に修正。
--          詳細はファイル末尾の「16. 月次コーチングレポート: 月範囲判定のタイムゾーン修正」
--          セクションのコメントを参照）
-- 更新日: 2026-09-13（月次コーチングレポート機能を追加。以下の【内容】とは別機能のため、
--          詳細はファイル末尾の「15. 月次コーチングレポート機能」セクションのコメントを参照）
-- 更新日: 2026-09-12（20260912_feature-20260911-dev_hotfix_release.sql を本ファイルに統合）
-- 更新日: 2026-09-12（com_t_session_reschedule_proposalへのcoach_idインデックス追加）
-- 更新日: 2026-09-11（宿題チェックリスト機能を追加。以下の【内容】とは別機能のため、
--          詳細はファイル末尾の「13. 宿題チェックリスト機能」セクションのコメントを参照）
--
-- 【内容】
--   生徒・コーチの個別セッション予約管理を全面的に見直す。
--
--   1. 「振替」という、既存セッションの日時をその場で変更する独立概念を廃止し、
--      個別セッションの扱いを「キャンセル（候補提案は任意・最大3件）」
--      「予約（承認制）」の2パターンに単純化する。
--   2. 未消化チケットによる新規予約（旧book_makeup_session）は、コーチの
--      Availability範囲内であれば即時確定していたが、Availability制約を撤廃して
--      自由に日時を選べるようにする代わりに、必ずコーチの承認を要するように変更する
--      （ダブルブッキング以外の「コーチの実際の都合」は承認ステップで担保する）。
--   3. コーチキャンセル時のみ可能だった振替候補の提案（最大3件、回答期限48時間）を、
--      生徒キャンセル時にも使えるよう双方向化する。回答期限は24時間に短縮する。
--   4. 上記2種類の「相手の承認を要する日時」（候補提案・予約リクエスト）はいずれも、
--      提案・リクエスト時点でダブルブッキングをインラインチェックできるよう、
--      共通のcheck_session_conflict()を新設する（承認・承諾時の最終チェックと共用）。
--
--   変更点の詳細:
--   1. com_t_session_reschedule_proposal に proposed_by_role カラムを追加
--      - 1:生徒が提案（コーチが承認/却下） 2:コーチが提案（生徒が承認/却下、既存仕様）
--   2. com_t_session_booking_request テーブルを新規作成
--      - 未消化チケットによる自由日時の新規予約リクエスト（コーチ承認制）。
--        書き込みはSECURITY DEFINER関数経由のみ。
--   3. check_session_conflict() (SECURITY DEFINER) を新規作成
--      - コーチ・生徒それぞれのダブルブッキング有無を返す共通ヘルパー。
--        cancel_session/accept_session_reschedule_proposal/
--        create_session_booking_request/approve_session_booking_requestの内部処理、
--        および画面側のインライン事前チェックの両方から呼ぶ。
--   4. cancel_session() を更新する
--      - p_proposed_slotsによる候補提案を生徒キャンセル時にも許可する（従来はコーチ
--        キャンセル時のみ有効で、生徒キャンセル時は無視していた）。
--      - 候補提案時、check_session_conflict()による事前チェックを追加する
--        （従来は承諾時のみチェックしていた）。
--      - 回答期限を48時間→24時間に短縮する。
--      - 生徒がキャンセルとあわせて候補を提案した場合、コーチへの通知を
--        SESSION_CANCELLED_BY_STUDENTではなくSESSION_RESCHEDULE_PROPOSED_BY_STUDENTにする。
--   5. accept_session_reschedule_proposal() を更新する
--      - 承諾できるのを「生徒のみ」から「提案者と逆側の当事者」に一般化する。
--      - ダブルブッキングチェックをcheck_session_conflict()呼び出しに統一する。
--      - コーチが承諾した場合（＝生徒提案の候補をコーチが選んだ場合）は生徒へ
--        SESSION_BOOKING_APPROVED通知を送る。
--   6. decline_session_reschedule_proposal(uuid) を廃止し、
--      decline_session_reschedule_proposals(uuid)（session_id単位で候補をまとめて
--      却下する版）に置き換える。UIの却下ボタンを「候補単位」から「提案全体で1つ」に
--      変更するため。
--   7. reschedule_session(uuid, date, time, text) を削除する（振替概念の廃止）。
--   8. book_makeup_session(uuid, date, time) を削除し、
--      create_session_booking_request(uuid, timestamptz, timestamptz, text) に
--      置き換える。com_t_sessionへ即時INSERTするのではなく、
--      com_t_session_booking_requestへpending行を作成するのみとし、Availability
--      チェックはcheck_session_conflict()によるダブルブッキングチェックのみに縮小する。
--   9. approve_session_booking_request() / reject_session_booking_request() /
--      withdraw_session_booking_request() (いずれもSECURITY DEFINER) を新規作成する
--      - 予約リクエストの承認・却下（コーチ）、取り下げ（生徒）。承認時に
--        com_t_sessionへ新規行を作成する。
--   10. admin_reschedule_session() / admin_book_session_direct() (いずれも
--       SECURITY DEFINER、管理者専用) を新規作成する
--      - アドミンのライブセッション管理画面が使っていたreschedule_session/
--        book_makeup_sessionのアドミン代理分岐（Availability・12時間ルールを免除し
--        即時反映する挙動）を、生徒・コーチ向けの承認制フローとは別に維持するための
--        管理者専用RPC。get_jwt_user_type()='0'以外からの呼び出しは拒否する。
--   11. [ホットフィックス] com_t_session の一意インデックス
--       uq_session_schedule_datetime を、status=1(scheduled)のみを対象とする
--       部分一意インデックスに変更する。
--      - 上記1〜10適用後、dev環境でadmin_book_session_directを使い、キャンセル済み
--        セッションと同一のschedule_id・start_datetimeで新規予約を試みたところ、
--        「duplicate key value violates unique constraint
--        "uq_session_schedule_datetime"」で失敗する不具合が発覚したための修正。
--        このインデックスは元々fn_generate_sessions_for_schedule()の冪等性担保用
--        （同一スケジュール・同一開始日時の重複生成防止）だったが、ステータスを
--        問わず全行を対象としていたため、キャンセル・振替元等の過去の行が新規予約
--        （accept_session_reschedule_proposal/approve_session_booking_request/
--        admin_reschedule_session/admin_book_session_direct、いずれもcom_t_sessionへの
--        INSERT）をブロックしていた。Wブッキング防止の対象を「有効な予約枠
--        （status=1）」のみに限定する。fn_generate_sessions_for_schedule()は常に
--        status=1の行しか作らないため、本来の冪等性担保という目的は損なわれない。
--   12. [追加] com_t_session_reschedule_proposal に (coach_id, status) の
--       インデックスを追加する。
--      - コーチ側の申請一覧(getIncomingRescheduleProposalsForCoachCore)がcoach_id +
--        statusで絞り込むクエリに変わったが、com_t_matching_request /
--        com_t_session_booking_requestには元々coach_id系インデックスがある一方、
--        このテーブルにはsession_id・(student_id, status)しか無く欠けていたため追加する。
--
--   通知種別(SESSION_BOOKING_REQUESTED/SESSION_BOOKING_APPROVED/
--   SESSION_BOOKING_REJECTED/SESSION_RESCHEDULE_PROPOSED_BY_STUDENT/
--   SESSION_UPDATED_BY_ADMIN)のTS側定義
--   (packages/types/notification.ts、apps/coach/constants/notification.ts)、
--   コーチ「マッチングリクエスト」画面の汎用申請承認画面化、生徒・コーチ双方の
--   カレンダーUI変更、apps/admin/actions/adminLiveSessionAction.tsの呼び出し先変更は
--   本SQLの対象外（DB変更のみ）。
-- =========================================================================


---------------------------------------------
-- 1. com_t_session_reschedule_proposal に proposed_by_role カラムを追加
---------------------------------------------
ALTER TABLE public.com_t_session_reschedule_proposal ADD COLUMN IF NOT EXISTS proposed_by_role smallint NOT NULL DEFAULT 2;
ALTER TABLE public.com_t_session_reschedule_proposal DROP CONSTRAINT IF EXISTS chk_proposal_proposed_by_role;
ALTER TABLE public.com_t_session_reschedule_proposal ADD CONSTRAINT chk_proposal_proposed_by_role CHECK (proposed_by_role IN (1, 2));
COMMENT ON COLUMN public.com_t_session_reschedule_proposal.proposed_by_role IS '候補の提案者 1:生徒が提案（コーチが承認/却下） 2:コーチが提案（生徒が承認/却下、デフォルト・既存仕様）';


---------------------------------------------
-- 2. com_t_session_booking_request テーブルを新規作成
---------------------------------------------
CREATE TABLE public.com_t_session_booking_request (
    request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES public.com_m_lesson_schedule(schedule_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    requested_start_datetime timestamp with time zone NOT NULL,
    requested_end_datetime timestamp with time zone NOT NULL,
    reason text DEFAULT NULL,
    status smallint NOT NULL DEFAULT 1, -- 1:pending 2:approved 3:rejected 4:withdrawn
    reject_reason text DEFAULT NULL,
    responded_at timestamp with time zone,
    resulting_session_id uuid REFERENCES public.com_t_session(session_id),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_booking_request_status CHECK (status IN (1, 2, 3, 4)),
    CONSTRAINT chk_booking_request_time_range CHECK (requested_end_datetime > requested_start_datetime)
);

COMMENT ON TABLE public.com_t_session_booking_request IS '未消化チケットによる自由日時の新規予約リクエスト（コーチの承認が必要）';
COMMENT ON COLUMN public.com_t_session_booking_request.schedule_id IS '対象の定期スケジュール（コマ。com_m_lesson_schedule）';
COMMENT ON COLUMN public.com_t_session_booking_request.reason IS '生徒が任意で添えるメモ（コーチへの一言）';
COMMENT ON COLUMN public.com_t_session_booking_request.status IS 'ステータス 1:pending(未回答) 2:approved(承認済み) 3:rejected(却下) 4:withdrawn(生徒による取下げ)';
COMMENT ON COLUMN public.com_t_session_booking_request.reject_reason IS 'コーチが却下時に任意で添える理由';
COMMENT ON COLUMN public.com_t_session_booking_request.resulting_session_id IS '承認により新規作成されたcom_t_session行（approved以外はNULL）';

CREATE INDEX idx_session_booking_request_schedule ON public.com_t_session_booking_request (schedule_id);
CREATE INDEX idx_session_booking_request_coach_status ON public.com_t_session_booking_request (coach_id, status);
CREATE INDEX idx_session_booking_request_student_status ON public.com_t_session_booking_request (student_id, status);

ALTER TABLE public.com_t_session_booking_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view booking requests" ON public.com_t_session_booking_request;
CREATE POLICY "Involved users can view booking requests" ON public.com_t_session_booking_request
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);


---------------------------------------------
-- 3. check_session_conflict() を新規作成
---------------------------------------------
CREATE OR REPLACE FUNCTION public.check_session_conflict(
    p_coach_id uuid,
    p_student_id uuid,
    p_start_datetime timestamptz,
    p_end_datetime timestamptz,
    p_exclude_session_id uuid DEFAULT NULL
)
RETURNS TABLE(coach_conflict boolean, student_conflict boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() NOT IN (p_coach_id, p_student_id) AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to check this schedule';
    END IF;

    RETURN QUERY SELECT
        EXISTS (
            SELECT 1 FROM public.com_t_session s
            WHERE s.coach_id = p_coach_id
              AND s.status = 1
              AND (p_exclude_session_id IS NULL OR s.session_id <> p_exclude_session_id)
              AND s.start_datetime < p_end_datetime
              AND s.end_datetime > p_start_datetime
        ),
        EXISTS (
            SELECT 1 FROM public.com_t_session s
            WHERE s.student_id = p_student_id
              AND s.status = 1
              AND (p_exclude_session_id IS NULL OR s.session_id <> p_exclude_session_id)
              AND s.start_datetime < p_end_datetime
              AND s.end_datetime > p_start_datetime
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_session_conflict(uuid, uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_session_conflict(uuid, uuid, timestamptz, timestamptz, uuid) TO authenticated;


---------------------------------------------
-- 4. cancel_session() を更新する
---------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_session(
    p_session_id uuid,
    p_reason text DEFAULT NULL,
    p_proposed_slots jsonb DEFAULT NULL,
    p_admin_refund_ticket boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_new_status smallint;
    v_refunded boolean;
    v_is_coach boolean;
    v_is_admin_proxy boolean;
    v_coach_name text;
    v_student_name text;
    v_slot jsonb;
    v_slot_start timestamptz;
    v_slot_end timestamptz;
    v_proposed_by_role smallint;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_proposal_count integer := 0;
    v_proposal_validity_hours CONSTANT integer := 24; -- 変更する場合はここを直接編集すること
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    v_is_admin_proxy := (v_session.student_id <> auth.uid() AND v_session.coach_id <> auth.uid());

    IF v_is_admin_proxy AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to cancel this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime <= NOW() THEN
        RAISE EXCEPTION 'cannot cancel a session that has already started';
    END IF;

    v_is_coach := (v_session.coach_id = auth.uid());

    IF v_is_admin_proxy THEN
        IF p_admin_refund_ticket IS NULL THEN
            RAISE EXCEPTION 'p_admin_refund_ticket is required for an admin-initiated cancellation';
        END IF;
        v_new_status := 10;
        v_refunded := p_admin_refund_ticket;
    ELSIF v_session.student_id = auth.uid() THEN
        v_new_status := 3;
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_new_status := 4;
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = v_new_status, cancel_reason = p_reason, cancelled_by = auth.uid(),
        ticket_refunded = v_refunded, update_date = NOW()
    WHERE session_id = p_session_id;

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_session.coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_session.student_id;

    -- 候補提案（コーチ・生徒いずれのキャンセルでも共通。アドミン代理操作では提案不可）
    IF NOT v_is_admin_proxy AND p_proposed_slots IS NOT NULL THEN
        v_proposed_by_role := CASE WHEN v_is_coach THEN 2 ELSE 1 END;
        v_proposal_count := jsonb_array_length(p_proposed_slots);
        IF v_proposal_count > 3 THEN
            RAISE EXCEPTION 'cannot propose more than 3 alternative times';
        END IF;

        FOR v_slot IN SELECT * FROM jsonb_array_elements(p_proposed_slots) LOOP
            v_slot_start := (v_slot->>'start_datetime')::timestamptz;
            v_slot_end := (v_slot->>'end_datetime')::timestamptz;

            IF v_slot_start <= NOW() THEN
                RAISE EXCEPTION 'proposed time must be in the future';
            END IF;
            IF v_slot_end <= v_slot_start THEN
                RAISE EXCEPTION 'invalid proposed time range';
            END IF;

            SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
            FROM public.check_session_conflict(v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end, p_session_id);
            IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
            IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

            INSERT INTO public.com_t_session_reschedule_proposal (
                session_id, coach_id, student_id, proposed_start_datetime, proposed_end_datetime,
                proposed_by_role, expires_at
            ) VALUES (
                p_session_id, v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end,
                v_proposed_by_role, NOW() + (v_proposal_validity_hours || ' hours')::interval
            );
        END LOOP;
    END IF;

    IF v_is_admin_proxy THEN
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        VALUES
            (v_session.student_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/live-room'),
            (v_session.coach_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/students/' || v_session.student_id);
    ELSIF v_is_coach THEN
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        VALUES (
            v_session.student_id,
            CASE WHEN v_proposal_count > 0 THEN 'SESSION_RESCHEDULE_PROPOSED' ELSE 'SESSION_CANCELLED_BY_COACH' END,
            jsonb_build_object(
                'session_id', p_session_id,
                'coach_name', v_coach_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', v_proposal_count
            ),
            '/live-room'
        );
    ELSE
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        VALUES (
            v_session.coach_id,
            CASE WHEN v_proposal_count > 0 THEN 'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT' ELSE 'SESSION_CANCELLED_BY_STUDENT' END,
            jsonb_build_object(
                'session_id', p_session_id,
                'student_name', v_student_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', v_proposal_count
            ),
            '/students/' || v_session.student_id
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean) TO authenticated;


---------------------------------------------
-- 5. accept_session_reschedule_proposal() を更新する
---------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_session_reschedule_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
    v_session RECORD;
    v_responder_id uuid;
    v_new_session_id uuid;
    v_coach_conflict boolean;
    v_student_conflict boolean;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_reschedule_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    v_responder_id := CASE WHEN v_proposal.proposed_by_role = 2 THEN v_proposal.student_id ELSE v_proposal.coach_id END;
    IF v_responder_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to respond to this proposal';
    END IF;

    IF v_proposal.status = 4 OR (v_proposal.status = 1 AND v_proposal.expires_at <= NOW()) THEN
        UPDATE public.com_t_session_reschedule_proposal SET status = 4, update_date = NOW() WHERE proposal_id = p_proposal_id AND status = 1;
        RAISE EXCEPTION 'this proposal has expired';
    END IF;

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = v_proposal.session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'original session % not found', v_proposal.session_id;
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_session.coach_id, v_session.student_id, v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_session.schedule_id, v_session.ticket_id, v_session.student_id, v_session.coach_id,
        v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime, 1, v_proposal.session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session_reschedule_proposal
    SET status = 2, responded_at = NOW(), resulting_session_id = v_new_session_id, update_date = NOW()
    WHERE proposal_id = p_proposal_id;

    UPDATE public.com_t_session_reschedule_proposal
    SET status = 3, responded_at = NOW(), update_date = NOW()
    WHERE session_id = v_proposal.session_id
      AND proposal_id <> p_proposal_id
      AND status = 1;

    IF v_responder_id = v_session.student_id THEN
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        SELECT
            v_session.coach_id,
            'SESSION_BOOKED_BY_STUDENT',
            jsonb_build_object(
                'session_id', v_new_session_id,
                'student_name', u.user_name,
                'session_start_datetime', v_proposal.proposed_start_datetime
            ),
            '/students/' || v_session.student_id
        FROM public.com_m_user u WHERE u.id = v_session.student_id;
    ELSE
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        SELECT
            v_session.student_id,
            'SESSION_BOOKING_APPROVED',
            jsonb_build_object(
                'session_id', v_new_session_id,
                'coach_name', u.user_name,
                'session_start_datetime', v_proposal.proposed_start_datetime
            ),
            '/live-room'
        FROM public.com_m_user u WHERE u.id = v_session.coach_id;
    END IF;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_session_reschedule_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_session_reschedule_proposal(uuid) TO authenticated;


---------------------------------------------
-- 6. decline_session_reschedule_proposal(uuid) を廃止し、
--    decline_session_reschedule_proposals(uuid) に置き換える
---------------------------------------------
DROP FUNCTION IF EXISTS public.decline_session_reschedule_proposal(uuid);

CREATE OR REPLACE FUNCTION public.decline_session_reschedule_proposals(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_any RECORD;
    v_responder_id uuid;
BEGIN
    SELECT * INTO v_any FROM public.com_t_session_reschedule_proposal
    WHERE session_id = p_session_id AND status = 1
    LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no pending proposals for session %', p_session_id;
    END IF;

    v_responder_id := CASE WHEN v_any.proposed_by_role = 2 THEN v_any.student_id ELSE v_any.coach_id END;
    IF v_responder_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to respond to this proposal';
    END IF;

    UPDATE public.com_t_session_reschedule_proposal
    SET status = 3, responded_at = NOW(), update_date = NOW()
    WHERE session_id = p_session_id AND status = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_session_reschedule_proposals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_session_reschedule_proposals(uuid) TO authenticated;


---------------------------------------------
-- 7. reschedule_session(uuid, date, time, text) を削除する
---------------------------------------------
DROP FUNCTION IF EXISTS public.reschedule_session(uuid, date, time, text);


---------------------------------------------
-- 8. book_makeup_session(uuid, date, time) を削除し、
--    create_session_booking_request(uuid, timestamptz, timestamptz, text) に置き換える
---------------------------------------------
DROP FUNCTION IF EXISTS public.book_makeup_session(uuid, date, time);

CREATE OR REPLACE FUNCTION public.create_session_booking_request(
    p_schedule_id uuid,
    p_start_datetime timestamptz,
    p_end_datetime timestamptz,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_shortfall integer;
    v_pending_count integer;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_request_id uuid;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.student_id <> auth.uid() THEN
        RAISE EXCEPTION 'not authorized to request a booking for this schedule';
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'lesson schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    IF p_end_datetime <= p_start_datetime THEN
        RAISE EXCEPTION 'invalid proposed time range';
    END IF;
    IF p_start_datetime <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    SELECT shortfall INTO v_shortfall FROM public.fn_schedule_shortfall(p_schedule_id);

    SELECT COUNT(*) INTO v_pending_count
    FROM public.com_t_session_booking_request r
    WHERE r.schedule_id = p_schedule_id AND r.status = 1;

    IF v_shortfall - v_pending_count <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_schedule.coach_id, v_schedule.student_id, p_start_datetime, p_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session_booking_request (
        schedule_id, student_id, coach_id, requested_start_datetime, requested_end_datetime, reason
    ) VALUES (
        p_schedule_id, v_schedule.student_id, v_schedule.coach_id, p_start_datetime, p_end_datetime, NULLIF(BTRIM(p_reason), '')
    )
    RETURNING request_id INTO v_request_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    SELECT
        v_schedule.coach_id,
        'SESSION_BOOKING_REQUESTED',
        jsonb_build_object(
            'request_id', v_request_id,
            'student_name', u.user_name,
            'requested_start_datetime', p_start_datetime
        ),
        '/students/' || v_schedule.student_id
    FROM public.com_m_user u WHERE u.id = v_schedule.student_id;

    RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) TO authenticated;


---------------------------------------------
-- 9. approve_session_booking_request() / reject_session_booking_request() /
--    withdraw_session_booking_request() を新規作成する
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_session_booking_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_schedule RECORD;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_new_session_id uuid;
BEGIN
    SELECT * INTO v_request FROM public.com_t_session_booking_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking request % not found', p_request_id;
    END IF;

    IF v_request.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to respond to this booking request';
    END IF;

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'this booking request is no longer pending (status=%)', v_request.status;
    END IF;

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = v_request.schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', v_request.schedule_id;
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_request.coach_id, v_request.student_id, v_request.requested_start_datetime, v_request.requested_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
    ) VALUES (
        v_schedule.schedule_id, v_schedule.ticket_id, v_request.student_id, v_request.coach_id,
        v_request.requested_start_datetime, v_request.requested_end_datetime, 1
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session_booking_request
    SET status = 2, responded_at = NOW(), resulting_session_id = v_new_session_id, update_date = NOW()
    WHERE request_id = p_request_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    SELECT
        v_request.student_id,
        'SESSION_BOOKING_APPROVED',
        jsonb_build_object(
            'request_id', p_request_id,
            'session_id', v_new_session_id,
            'coach_name', u.user_name,
            'session_start_datetime', v_request.requested_start_datetime
        ),
        '/live-room'
    FROM public.com_m_user u WHERE u.id = v_request.coach_id;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_session_booking_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_session_booking_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_session_booking_request(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
BEGIN
    SELECT * INTO v_request FROM public.com_t_session_booking_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking request % not found', p_request_id;
    END IF;

    IF v_request.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to respond to this booking request';
    END IF;

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'this booking request is no longer pending (status=%)', v_request.status;
    END IF;

    UPDATE public.com_t_session_booking_request
    SET status = 3, reject_reason = NULLIF(BTRIM(p_reason), ''), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    SELECT
        v_request.student_id,
        'SESSION_BOOKING_REJECTED',
        jsonb_build_object(
            'request_id', p_request_id,
            'coach_name', u.user_name,
            'reject_reason', p_reason,
            'requested_start_datetime', v_request.requested_start_datetime
        ),
        '/live-room'
    FROM public.com_m_user u WHERE u.id = v_request.coach_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_session_booking_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_session_booking_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_session_booking_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
BEGIN
    SELECT * INTO v_request FROM public.com_t_session_booking_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking request % not found', p_request_id;
    END IF;

    IF v_request.student_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to withdraw this booking request';
    END IF;

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'this booking request is no longer pending (status=%)', v_request.status;
    END IF;

    UPDATE public.com_t_session_booking_request
    SET status = 4, responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.withdraw_session_booking_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_session_booking_request(uuid) TO authenticated;


---------------------------------------------
-- 10. admin_reschedule_session() / admin_book_session_direct() を新規作成する
--     （アドミンのライブセッション管理画面専用。get_jwt_user_type()='0'のみ許可）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reschedule_session(
    p_session_id uuid,
    p_new_start_datetime timestamptz,
    p_new_end_datetime timestamptz,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_new_session_id uuid;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to reschedule this session';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF p_new_end_datetime <= p_new_start_datetime THEN
        RAISE EXCEPTION 'invalid proposed time range';
    END IF;
    IF p_new_start_datetime <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_session.coach_id, v_session.student_id, p_new_start_datetime, p_new_end_datetime, p_session_id);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_session.schedule_id, v_session.ticket_id, v_session.student_id, v_session.coach_id,
        p_new_start_datetime, p_new_end_datetime, 1, p_session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session
    SET status = 5, cancel_reason = p_reason, cancelled_by = auth.uid(), update_date = NOW()
    WHERE session_id = p_session_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES
        (v_session.student_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'new_session_id', v_new_session_id, 'session_start_datetime', p_new_start_datetime), '/live-room'),
        (v_session.coach_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'new_session_id', v_new_session_id, 'session_start_datetime', p_new_start_datetime), '/students/' || v_session.student_id);

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reschedule_session(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reschedule_session(uuid, timestamptz, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_book_session_direct(
    p_schedule_id uuid,
    p_start_datetime timestamptz,
    p_end_datetime timestamptz,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_new_session_id uuid;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to book a session for this schedule';
    END IF;

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'lesson schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    IF p_end_datetime <= p_start_datetime THEN
        RAISE EXCEPTION 'invalid proposed time range';
    END IF;
    IF p_start_datetime <= NOW() THEN
        RAISE EXCEPTION 'new start datetime must be in the future';
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_schedule.coach_id, v_schedule.student_id, p_start_datetime, p_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
    ) VALUES (
        v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
        p_start_datetime, p_end_datetime, 1
    )
    RETURNING session_id INTO v_new_session_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES
        (v_schedule.student_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', v_new_session_id, 'session_start_datetime', p_start_datetime), '/live-room'),
        (v_schedule.coach_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', v_new_session_id, 'session_start_datetime', p_start_datetime), '/students/' || v_schedule.student_id);

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_book_session_direct(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_book_session_direct(uuid, timestamptz, timestamptz, text) TO authenticated;


---------------------------------------------
-- 11. [ホットフィックス] com_t_session の一意インデックス uq_session_schedule_datetime を
--     status=1(scheduled)のみを対象とする部分一意インデックスに変更する
---------------------------------------------
DROP INDEX IF EXISTS public.uq_session_schedule_datetime;
CREATE UNIQUE INDEX uq_session_schedule_datetime ON public.com_t_session (schedule_id, start_datetime) WHERE status = 1;


---------------------------------------------
-- 12. [追加] com_t_session_reschedule_proposal に (coach_id, status) のインデックスを追加する
---------------------------------------------
CREATE INDEX IF NOT EXISTS idx_session_reschedule_proposal_coach_status ON public.com_t_session_reschedule_proposal (coach_id, status);


-- =========================================================================
-- 13. 宿題チェックリスト機能 (2026-09-11 追加)
-- 更新: 2026-09-12（メッセージ投稿(com_t_session_homework)からセッション(com_t_session)
--       へ紐付け先を変更。dev環境には旧スキーマ（homework_id紐付け）が反映済みだが、
--       本番未適用のためDROP TABLE→再CREATEで置き換える。旧スキーマ下のテストデータは
--       破棄される）
-- =========================================================================
-- 【背景】
-- コーチの宿題管理はこれまで自由メッセージの送信のみで、生徒側の進捗管理ができな
-- かった。コーチが自由記述で最大5件まで設定できるチェックリスト（Todo/Candoリストの
-- イメージ）を提示できるようにし、生徒がON/OFFで完了操作できるようにする。
--
-- 当初はcom_t_session_homework（宿題メッセージの1投稿）に1:1で紐付ける設計だったが、
-- 1セッションに対してコーチが複数回メッセージを送ると、その都度チェックリストが
-- 増殖して生徒側で分かりにくくなる。そのため、宿題メッセージの投稿単位ではなく、
-- セッション(com_t_session)に対して1:1で紐付ける設計に変更する。これによりチェック
-- リストの作成・更新はメッセージ投稿とは独立したライフサイクルを持つ。
--
-- com_t_session_homeworkは投稿後の編集・削除を許可しない追記専用（コーチ評価の証跡の
-- ため）だが、このテーブルはメッセージから独立しているため同じ制約を継承する必要は
-- ない。ただし、生徒が既に完了操作した項目の意味が後から変わらないよう、既存項目の
-- item_text変更・削除はコーチであっても不可とし、上限5件までの範囲での項目「追加」
-- （INSERT）のみ許可する。is_done/done_atのみ生徒本人が更新可能とする（列単位GRANTで
-- 保護。com_m_user.sqlのtimezone/icon_path自己更新パターンを参照）。
--
-- 詳細はtable/com_t_session_homework_checklist_item.sqlのコメントを参照。
-- =========================================================================
DROP TABLE IF EXISTS public.com_t_session_homework_checklist_item CASCADE;

CREATE TABLE public.com_t_session_homework_checklist_item (
    checklist_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    item_no smallint NOT NULL,
    item_text text NOT NULL,
    is_done boolean NOT NULL DEFAULT false,
    done_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_homework_checklist_item_no CHECK (item_no BETWEEN 1 AND 5),
    CONSTRAINT chk_homework_checklist_item_text_not_blank CHECK (btrim(item_text) <> ''),
    CONSTRAINT chk_homework_checklist_done_at CHECK ((is_done AND done_at IS NOT NULL) OR (NOT is_done AND done_at IS NULL)),
    CONSTRAINT uq_homework_checklist_item_no UNIQUE (session_id, item_no)
);

COMMENT ON TABLE public.com_t_session_homework_checklist_item IS 'セッション単位の宿題チェックリスト項目（コーチが最大5件まで自由記述で追加、生徒がON/OFFで完了操作）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.checklist_item_id IS 'チェックリスト項目ID';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.session_id IS '対象のレッスンセッション (com_t_session)。宿題メッセージ(com_t_session_homework)とは独立';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.item_no IS '表示順（1〜5、追加した順に採番。既存項目の欠番は詰めない）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.item_text IS '項目本文（追加時のみ設定、以後不変。修正したい場合は削除ではなく新規追加で対応する運用とする）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.is_done IS '完了フラグ（生徒本人のみ更新可能）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.done_at IS '完了操作日時（is_done=falseに戻すとNULLに戻る）';

CREATE INDEX idx_homework_checklist_item_session ON public.com_t_session_homework_checklist_item (session_id, item_no);

ALTER TABLE public.com_t_session_homework_checklist_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can view homework checklist items" ON public.com_t_session_homework_checklist_item
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework_checklist_item.session_id
        AND (s.coach_id = auth.uid() OR s.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

CREATE POLICY "Coaches can add checklist items to their own sessions" ON public.com_t_session_homework_checklist_item
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework_checklist_item.session_id
        AND s.coach_id = auth.uid()
    )
);

CREATE POLICY "Students can update done status of their own checklist items" ON public.com_t_session_homework_checklist_item
FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework_checklist_item.session_id
        AND s.student_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework_checklist_item.session_id
        AND s.student_id = auth.uid()
    )
);

-- 生徒が更新できる列を is_done/done_at/update_date のみに制限する（item_text/item_no/session_idの改ざんを防止）
REVOKE UPDATE ON public.com_t_session_homework_checklist_item FROM authenticated, anon;
GRANT UPDATE (is_done, done_at, update_date) ON public.com_t_session_homework_checklist_item TO authenticated;


-- =========================================================================
-- 14. 宿題モデルの親子正規化 + フォローアップコメント + 投稿通知 (2026-09-12 追加)
-- =========================================================================
-- 【背景】
-- 「宿題の指示・説明（必須）＋チェックリスト（任意）を1セットで発信し、以降の連絡は
-- フォローアップコメントとして明確に区別したい」という要望、および「コーチが宿題を
-- 投稿/追記した際に生徒へ通知したい」という要望を受け、宿題を以下の親子構造に再設計する。
--   com_t_session_homework（宿題本体、1セッション1件）
--     ├─ com_t_session_homework_checklist_item（チェックリスト、homework_id直下）
--     ├─ com_t_session_homework_comment（フォローアップコメント、新設）
--     └─ com_t_session_homework_attachment（添付、本体/コメントいずれかに紐づく）
-- 宿題管理機能はdev環境のみへの反映でステージング/本番は未反映のため、既存テストデータの
-- 互換性は考慮せずDROP TABLE→再CREATEで置き換える（本セクション適用によりcom_t_session_homework
-- 配下の既存テストデータは全て破棄される）。詳細は各テーブルのDDL（table/com_t_session_homework*.sql）
-- のコメントを参照。
-- =========================================================================

-- 依存関係の末端（子）から順にDROPする
DROP TABLE IF EXISTS public.com_t_session_homework_attachment CASCADE;
DROP TABLE IF EXISTS public.com_t_session_homework_checklist_item CASCADE;
DROP TABLE IF EXISTS public.com_t_session_homework CASCADE;

-- ---------------------------------------------
-- 14-1. com_t_session_homework（宿題本体、1セッション1件に再定義）
-- ---------------------------------------------
CREATE TABLE public.com_t_session_homework (
    homework_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL UNIQUE REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    homework_text text NOT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_homework_text_not_blank CHECK (btrim(homework_text) <> '')
);

COMMENT ON TABLE public.com_t_session_homework IS 'セッション単位の宿題本体（1セッション1件、コーチのみ投稿、追記専用・生徒も閲覧可）。チェックリスト・フォローアップコメントの親';
COMMENT ON COLUMN public.com_t_session_homework.homework_id IS '宿題ID';
COMMENT ON COLUMN public.com_t_session_homework.session_id IS '対象の個別レッスンセッション (com_t_session)。UNIQUE制約により1セッション1件';
COMMENT ON COLUMN public.com_t_session_homework.coach_id IS '投稿したコーチのユーザID（com_t_session.coach_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework.student_id IS '対象の生徒のユーザID（非正規化。com_t_session.student_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework.homework_text IS '宿題本文（自由メッセージ）';
COMMENT ON COLUMN public.com_t_session_homework.insert_date IS '登録日時';

CREATE INDEX idx_session_homework_session ON public.com_t_session_homework (session_id, insert_date DESC);
CREATE INDEX idx_session_homework_student ON public.com_t_session_homework (student_id, insert_date DESC);

ALTER TABLE public.com_t_session_homework ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can view session homework" ON public.com_t_session_homework
FOR SELECT TO authenticated USING (
    coach_id = auth.uid()
    OR student_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

CREATE POLICY "Coaches can post homework for their own sessions" ON public.com_t_session_homework
FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework.session_id
        AND s.coach_id = auth.uid()
        AND s.student_id = com_t_session_homework.student_id
    )
);

-- ---------------------------------------------
-- 14-2. com_t_session_homework_comment（フォローアップコメント、新設）
-- ---------------------------------------------
CREATE TABLE public.com_t_session_homework_comment (
    comment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id uuid NOT NULL REFERENCES public.com_t_session_homework(homework_id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    comment_text text NOT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_homework_comment_text_not_blank CHECK (btrim(comment_text) <> '')
);

COMMENT ON TABLE public.com_t_session_homework_comment IS '宿題本体投稿後のフォローアップコメント（コーチのみ投稿、追記専用・生徒も閲覧可）';
COMMENT ON COLUMN public.com_t_session_homework_comment.comment_id IS 'コメントID';
COMMENT ON COLUMN public.com_t_session_homework_comment.homework_id IS '対象の宿題本体 (com_t_session_homework)';
COMMENT ON COLUMN public.com_t_session_homework_comment.coach_id IS '投稿したコーチのユーザID（対象宿題のcoach_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework_comment.comment_text IS 'コメント本文（自由メッセージ）';
COMMENT ON COLUMN public.com_t_session_homework_comment.insert_date IS '登録日時';

CREATE INDEX idx_session_homework_comment_homework ON public.com_t_session_homework_comment (homework_id, insert_date DESC);

ALTER TABLE public.com_t_session_homework_comment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can view homework comments" ON public.com_t_session_homework_comment
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_comment.homework_id
        AND (h.coach_id = auth.uid() OR h.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

CREATE POLICY "Coaches can post comments on their own homework posts" ON public.com_t_session_homework_comment
FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_comment.homework_id
        AND h.coach_id = auth.uid()
    )
);

-- ---------------------------------------------
-- 14-3. com_t_session_homework_checklist_item（チェックリスト、homework_id直下に再変更）
-- ---------------------------------------------
CREATE TABLE public.com_t_session_homework_checklist_item (
    checklist_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id uuid NOT NULL REFERENCES public.com_t_session_homework(homework_id) ON DELETE CASCADE,
    item_no smallint NOT NULL,
    item_text text NOT NULL,
    is_done boolean NOT NULL DEFAULT false,
    done_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_homework_checklist_item_no CHECK (item_no BETWEEN 1 AND 5),
    CONSTRAINT chk_homework_checklist_item_text_not_blank CHECK (btrim(item_text) <> ''),
    CONSTRAINT chk_homework_checklist_done_at CHECK ((is_done AND done_at IS NOT NULL) OR (NOT is_done AND done_at IS NULL)),
    CONSTRAINT uq_homework_checklist_item_no UNIQUE (homework_id, item_no)
);

COMMENT ON TABLE public.com_t_session_homework_checklist_item IS '宿題本体単位のチェックリスト項目（コーチが宿題本体作成時に最大5件まで自由記述で一括登録、生徒がON/OFFで完了操作。本体作成後の追加は不可）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.checklist_item_id IS 'チェックリスト項目ID';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.homework_id IS '対象の宿題本体 (com_t_session_homework)';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.item_no IS '表示順（1〜5、追加した順に採番。既存項目の欠番は詰めない）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.item_text IS '項目本文（追加時のみ設定、以後不変。修正したい場合は削除ではなく新規追加で対応する運用とする）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.is_done IS '完了フラグ（生徒本人のみ更新可能）';
COMMENT ON COLUMN public.com_t_session_homework_checklist_item.done_at IS '完了操作日時（is_done=falseに戻すとNULLに戻る）';

CREATE INDEX idx_homework_checklist_item_homework ON public.com_t_session_homework_checklist_item (homework_id, item_no);

ALTER TABLE public.com_t_session_homework_checklist_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can view homework checklist items" ON public.com_t_session_homework_checklist_item
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_checklist_item.homework_id
        AND (h.coach_id = auth.uid() OR h.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

-- 「対象宿題に既存項目が1件もない場合のみ」に制限し、宿題本体作成時の一括登録のみを許可する
-- （同一INSERT文内の複数行は互いに見えないため、作成時の複数件登録は妨げない。以後の追加は
-- DBレベルで拒否し、連絡はcom_t_session_homework_commentで行う運用とする。2026-09-12更新）
CREATE POLICY "Coaches can add checklist items to their own sessions" ON public.com_t_session_homework_checklist_item
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_checklist_item.homework_id
        AND h.coach_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.com_t_session_homework_checklist_item existing
      WHERE existing.homework_id = com_t_session_homework_checklist_item.homework_id
    )
);

CREATE POLICY "Students can update done status of their own checklist items" ON public.com_t_session_homework_checklist_item
FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_checklist_item.homework_id
        AND h.student_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_checklist_item.homework_id
        AND h.student_id = auth.uid()
    )
);

REVOKE UPDATE ON public.com_t_session_homework_checklist_item FROM authenticated, anon;
GRANT UPDATE (is_done, done_at, update_date) ON public.com_t_session_homework_checklist_item TO authenticated;

-- ---------------------------------------------
-- 14-4. com_t_session_homework_attachment（添付、本体/コメント両対応に拡張）
-- ---------------------------------------------
CREATE TABLE public.com_t_session_homework_attachment (
    homework_attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id uuid REFERENCES public.com_t_session_homework(homework_id) ON DELETE CASCADE,
    comment_id uuid REFERENCES public.com_t_session_homework_comment(comment_id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size bigint NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_homework_attachment_owner CHECK (
        (homework_id IS NOT NULL AND comment_id IS NULL) OR (homework_id IS NULL AND comment_id IS NOT NULL)
    )
);

COMMENT ON TABLE public.com_t_session_homework_attachment IS '宿題添付ファイル（宿題本体・フォローアップコメントのどちらか一方に紐づく）';
COMMENT ON COLUMN public.com_t_session_homework_attachment.homework_attachment_id IS '添付ファイルID';
COMMENT ON COLUMN public.com_t_session_homework_attachment.homework_id IS '宿題本体ID (com_t_session_homework)。宿題本体への添付の場合のみ設定';
COMMENT ON COLUMN public.com_t_session_homework_attachment.comment_id IS 'フォローアップコメントID (com_t_session_homework_comment)。コメントへの添付の場合のみ設定';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_path IS 'Storage上のパス ("homework"バケット)';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_name IS '元のファイル名';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_type IS 'MIMEタイプ';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_size IS 'ファイルサイズ (バイト)';
COMMENT ON COLUMN public.com_t_session_homework_attachment.created_at IS 'アップロード日時';

CREATE INDEX idx_session_homework_attachment_homework ON public.com_t_session_homework_attachment (homework_id) WHERE homework_id IS NOT NULL;
CREATE INDEX idx_session_homework_attachment_comment ON public.com_t_session_homework_attachment (comment_id) WHERE comment_id IS NOT NULL;

ALTER TABLE public.com_t_session_homework_attachment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can view homework attachments" ON public.com_t_session_homework_attachment
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_attachment.homework_id
        AND (h.coach_id = auth.uid() OR h.student_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.com_t_session_homework_comment c
      JOIN public.com_t_session_homework h ON h.homework_id = c.homework_id
      WHERE c.comment_id = com_t_session_homework_attachment.comment_id
        AND (h.coach_id = auth.uid() OR h.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

CREATE POLICY "Coaches can attach files to their own homework posts" ON public.com_t_session_homework_attachment
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_attachment.homework_id
        AND h.coach_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.com_t_session_homework_comment c
      JOIN public.com_t_session_homework h ON h.homework_id = c.homework_id
      WHERE c.comment_id = com_t_session_homework_attachment.comment_id
        AND c.coach_id = auth.uid()
        AND h.coach_id = auth.uid()
    )
);

-- ---------------------------------------------
-- 14-5. 宿題投稿・フォローアップコメント通知（HOMEWORK_POSTED、com_t_notification）
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_session_homework_posted()
RETURNS TRIGGER AS $$
DECLARE
  v_coach_name TEXT;
BEGIN
  SELECT user_name INTO v_coach_name
  FROM public.com_m_user
  WHERE id = NEW.coach_id;

  INSERT INTO public.com_t_notification (
    user_id, notification_type, dedup_key, payload, link_path, occurred_at
  )
  VALUES (
    NEW.student_id,
    'HOMEWORK_POSTED',
    NEW.session_id::text,
    jsonb_build_object(
      'session_id', NEW.session_id,
      'coach_id', NEW.coach_id,
      'coach_name', v_coach_name,
      'preview', LEFT(NEW.homework_text, 100)
    ),
    '/live-room/sessions/' || NEW.session_id || '/result',
    NEW.insert_date
  )
  ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    occurred_at = EXCLUDED.occurred_at,
    is_read = FALSE,
    read_at = NULL,
    update_date = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_session_homework_insert_notify ON public.com_t_session_homework;
CREATE TRIGGER on_session_homework_insert_notify
AFTER INSERT ON public.com_t_session_homework
FOR EACH ROW EXECUTE PROCEDURE public.notify_session_homework_posted();

REVOKE EXECUTE ON FUNCTION public.notify_session_homework_posted() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_session_homework_comment_posted()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id UUID;
  v_student_id UUID;
  v_coach_name TEXT;
BEGIN
  SELECT h.session_id, h.student_id, u.user_name
  INTO v_session_id, v_student_id, v_coach_name
  FROM public.com_t_session_homework h
  JOIN public.com_m_user u ON u.id = NEW.coach_id
  WHERE h.homework_id = NEW.homework_id;

  INSERT INTO public.com_t_notification (
    user_id, notification_type, dedup_key, payload, link_path, occurred_at
  )
  VALUES (
    v_student_id,
    'HOMEWORK_POSTED',
    v_session_id::text,
    jsonb_build_object(
      'session_id', v_session_id,
      'coach_id', NEW.coach_id,
      'coach_name', v_coach_name,
      'preview', LEFT(NEW.comment_text, 100)
    ),
    '/live-room/sessions/' || v_session_id || '/result',
    NEW.insert_date
  )
  ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    occurred_at = EXCLUDED.occurred_at,
    is_read = FALSE,
    read_at = NULL,
    update_date = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_session_homework_comment_insert_notify ON public.com_t_session_homework_comment;
CREATE TRIGGER on_session_homework_comment_insert_notify
AFTER INSERT ON public.com_t_session_homework_comment
FOR EACH ROW EXECUTE PROCEDURE public.notify_session_homework_comment_posted();

REVOKE EXECUTE ON FUNCTION public.notify_session_homework_comment_posted() FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- 15. 月次コーチングレポート機能 (2026-09-13 追加)
---------------------------------------------
-- コーチ毎・月次のライブセッション実施状況（Monthly Coaching Report）をコーチ・アドミン双方の
-- 画面から確認できるようにし、アドミンが月次の稼働を承認/承認取消しできるようにする。
-- 対応ファイル: table/com_t_coach_monthly_report_approval.sql,
--   function/get_coach_monthly_active_students.sql, function/get_coach_monthly_sessions.sql,
--   function/approve_coach_monthly_report.sql, function/revoke_coach_monthly_report_approval.sql
---------------------------------------------

---------------------------------------------
-- DDL: com_t_coach_monthly_report_approval (コーチ月次コーチングレポート承認) (2026-09-13 追加)
---------------------------------------------
-- 【背景】
-- コーチ毎・月次のライブセッション実施状況（Monthly Coaching Report）をアドミンが確認し、
-- その月のコーチの稼働を確定させるための承認記録。コーチ側から申請する概念は無く、
-- アドミンが一方的に「承認」または「承認取消し」（承認後に誤りへ気付いた場合の取消しのみ）を
-- 行うシンプルな2状態モデル（1:未承認 2:承認済み）とする。差し戻し履歴は保持せず、
-- (coach_id, report_month) に対して常に最新状態の1行のみを保持する。
--
-- 承認時点のセッション集計値は session_count_snapshot にJSONBで固定保存する。これにより、
-- 承認後に過去分セッションの終了処理漏れが事後解決される等でカウントが変動しても、
-- 承認済み表示（当時の数値）は影響を受けない。承認取消し時は次の承認まで意味を持たないため
-- NULLに戻す。
--
-- 【書き込み経路】
-- 本テーブルへの直接書き込みはRLSで許可しない。承認/承認取消しは
-- function/approve_coach_monthly_report.sql / function/revoke_coach_monthly_report_approval.sql
-- （いずれもSECURITY DEFINER、管理者専用）経由のみとする。
---------------------------------------------
CREATE TABLE public.com_t_coach_monthly_report_approval (
    approval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    report_month date NOT NULL, -- 対象月の1日 (例: 2026-09-01)
    status smallint NOT NULL DEFAULT 1, -- 1:未承認 2:承認済み
    session_count_snapshot jsonb DEFAULT NULL, -- 承認時点の集計 {"total": n, "by_student": [{"student_id":"...", "count": n}]}
    approved_by uuid REFERENCES public.com_m_user(id),
    approved_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    UNIQUE (coach_id, report_month),
    CONSTRAINT chk_report_approval_status CHECK (status IN (1, 2))
);

COMMENT ON TABLE public.com_t_coach_monthly_report_approval IS 'コーチ月次コーチングレポートの承認状態（アドミンが承認/承認取消しを行う。コーチからの申請概念は無い）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.approval_id IS '承認レコードID';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.coach_id IS '対象コーチのユーザID';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.report_month IS '対象年月（その月の1日で表現、例: 2026-09-01）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.status IS 'ステータス 1:未承認 2:承認済み';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.session_count_snapshot IS '承認時点のセッション集計スナップショット（承認取消し時にNULLへ戻す）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.approved_by IS '承認を行った管理者のユーザID';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.approved_at IS '承認日時';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.update_date IS '更新日時';

CREATE INDEX idx_coach_monthly_report_approval_coach ON public.com_t_coach_monthly_report_approval (coach_id, report_month);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_coach_monthly_report_approval ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and admin can view monthly report approval" ON public.com_t_coach_monthly_report_approval;

-- [参照] コーチ本人・管理者のみ閲覧可能。書き込みはSECURITY DEFINER関数経由のみとし、
-- authenticatedロールへのINSERT/UPDATE/DELETE権限は付与しない。
CREATE POLICY "Coach and admin can view monthly report approval" ON public.com_t_coach_monthly_report_approval
FOR SELECT TO authenticated USING (
    coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

---------------------------------------------
-- 月次コーチングレポート: コーチ担当の有効契約生徒一覧RPC (2026-09-13 追加)
-- 前提: table/com_m_coach_student_relationship.sql, table/com_t_user_license.sql,
--       table/com_m_contract.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 月次コーチングレポートの縦軸（対象生徒）を決定する。「有効契約を持つ生徒」とは、
-- 対象月(p_report_month)の期間内のいずれかの時点で、ライセンス(status=1)・契約(status=1)
-- がともに有効だった生徒を指す。過去月を参照するケースがあるため、現在時刻基準
-- (now() between start/end) ではなく、対象月の範囲と契約期間が重なるかどうかで判定する
-- （getStudentOverviewCoreの「現在有効な契約」判定を月範囲版に一般化したもの）。
-- 担当関係(com_m_coach_student_relationship)はstatus不問（is_activeを問わない）で対象とする。
-- コーチ交代直後で当月分の実績が残っているケースを取りこぼさないため。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_monthly_active_students(p_coach_id uuid, p_report_month date)
RETURNS TABLE(student_id uuid, user_name text, icon_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month_start date := date_trunc('month', p_report_month)::date;
    v_month_end date := (date_trunc('month', p_report_month) + interval '1 month' - interval '1 day')::date;
BEGIN
    IF auth.uid() <> p_coach_id AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to view this coach''s monthly report';
    END IF;

    RETURN QUERY
    SELECT DISTINCT u.id, u.user_name, u.icon_path
    FROM public.com_m_coach_student_relationship r
    JOIN public.com_m_user u ON u.id = r.student_id
    WHERE r.coach_id = p_coach_id
      AND EXISTS (
          SELECT 1
          FROM public.com_t_user_license l
          JOIN public.com_m_contract c ON c.contract_id = l.contract_id
          WHERE l.user_id = r.student_id
            AND l.status = 1
            AND c.status = 1
            AND l.start_date <= (v_month_end + 1)::timestamptz
            AND l.end_date >= v_month_start::timestamptz
      )
    ORDER BY u.user_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_active_students(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_active_students(uuid, date) TO authenticated;

---------------------------------------------
-- 月次コーチングレポート: 対象月セッション一覧RPC (2026-09-13 追加)
-- 前提: table/com_t_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 月次コーチングレポートのグリッド描画・要注意セル判定・詳細モーダル表示の唯一のデータ源。
-- カウント規則(counts_toward_total)・注意色判定(is_unresolved/is_attention)は、このRPCが
-- 単一の実装箇所となる（呼び出し側TypeScript・承認RPCのいずれもここで計算済みの値をそのまま使う）。
--
-- 【カウント規則】
-- completed(2) / early_ended(7) / no_show(6) / 生徒都合12h以内キャンセル(status=3かつ
-- ticket_refunded=false) をコーチの稼働実績としてカウントする。
-- cancelled_by_admin(10)はアドミン代理操作のため常に対象外。コーチキャンセル(4)・
-- 生徒都合12h以上前キャンセル(status=3かつticket_refunded=true)・振替元(5)・
-- ライセンス無効化(8)・コーチ交代(9)もカウントしない。
--
-- 【注意色】
-- is_unresolved: 終了処理が行われていない枠（status=1かつ終了予定時刻を過ぎている）
-- is_attention: 12h以内キャンセル・No show・早期終了を含む枠（is_unresolvedとは別の注意色）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_monthly_sessions(p_coach_id uuid, p_report_month date)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    status_note text,
    ticket_refunded boolean,
    counts_toward_total boolean,
    is_unresolved boolean,
    is_attention boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month_start date := date_trunc('month', p_report_month)::date;
    v_month_end date := (date_trunc('month', p_report_month) + interval '1 month' - interval '1 day')::date;
BEGIN
    IF auth.uid() <> p_coach_id AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to view this coach''s monthly report';
    END IF;

    RETURN QUERY
    SELECT
        s.session_id,
        s.student_id,
        s.start_datetime,
        s.end_datetime,
        s.status,
        s.status_note,
        s.ticket_refunded,
        (s.status IN (2, 6, 7) OR (s.status = 3 AND s.ticket_refunded = false)) AS counts_toward_total,
        (s.status = 1 AND s.end_datetime < NOW()) AS is_unresolved,
        (s.status IN (6, 7) OR (s.status = 3 AND s.ticket_refunded = false)) AS is_attention
    FROM public.com_t_session s
    WHERE s.coach_id = p_coach_id
      AND s.start_datetime >= v_month_start::timestamptz
      AND s.start_datetime < (v_month_end + 1)::timestamptz
    ORDER BY s.student_id, s.start_datetime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) TO authenticated;

---------------------------------------------
-- 月次コーチングレポート承認RPC (2026-09-13 追加)
-- 前提: table/com_t_coach_monthly_report_approval.sql, function/get_coach_monthly_sessions.sql
--       の作成が完了していること。
---------------------------------------------
-- 【背景】
-- アドミンが対象コーチ・対象月の稼働を確認した上で承認する。コーチからの申請フローは無く、
-- アドミンの一方的な操作のみで確定する。承認時点のセッション集計（get_coach_monthly_sessionsの
-- counts_toward_totalを生徒別に集計したもの）をJSONBスナップショットとして固定保存し、
-- 事後のデータ変動（終了処理漏れの遅延解決等）から承認済み表示を保護する。
--
-- 【呼び出し元】
-- apps/adminはcreateAdminClient()(service_role)経由で呼ぶため、本関数内でauth.uid()は
-- 取得できない（NULLになる）。そのため承認者IDはp_approved_byとして明示的に受け取る
-- （adminContractAction.tsのperformed_by: resolvePerformedBy(ctx.userId)と同じ理由）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_coach_monthly_report(
    p_coach_id uuid,
    p_report_month date,
    p_approved_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month date := date_trunc('month', p_report_month)::date;
    v_snapshot jsonb;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to approve this monthly report';
    END IF;

    SELECT jsonb_build_object(
        'total', COALESCE(SUM((counts_toward_total)::int), 0),
        'by_student', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('student_id', student_id, 'count', cnt))
             FROM (
                 SELECT student_id, SUM((counts_toward_total)::int) AS cnt
                 FROM public.get_coach_monthly_sessions(p_coach_id, v_month)
                 GROUP BY student_id
             ) per_student),
            '[]'::jsonb
        )
    )
    INTO v_snapshot
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month);

    INSERT INTO public.com_t_coach_monthly_report_approval (
        coach_id, report_month, status, session_count_snapshot, approved_by, approved_at, update_date
    ) VALUES (
        p_coach_id, v_month, 2, v_snapshot, p_approved_by, NOW(), NOW()
    )
    ON CONFLICT (coach_id, report_month) DO UPDATE
    SET status = 2,
        session_count_snapshot = v_snapshot,
        approved_by = p_approved_by,
        approved_at = NOW(),
        update_date = NOW();

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        p_coach_id,
        'COACH_REPORT_APPROVED',
        jsonb_build_object('report_month', v_month),
        '/monthly-reports'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) TO authenticated;

---------------------------------------------
-- 月次コーチングレポート承認取消しRPC (2026-09-13 追加)
-- 前提: table/com_t_coach_monthly_report_approval.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- アドミンが承認後に誤りへ気付いた場合に、承認を取り消して未承認状態へ戻す。
-- コーチへの差し戻し（再申請を促す）フローではなく、単純な承認取消しのみ。
-- 取消し後は再度approve_coach_monthly_reportで承認し直すことを想定するため、
-- 承認時点のスナップショットはNULLへ戻す（再承認時に最新値で作り直される）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_coach_monthly_report_approval(
    p_coach_id uuid,
    p_report_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month date := date_trunc('month', p_report_month)::date;
    v_approval RECORD;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to revoke this monthly report approval';
    END IF;

    SELECT * INTO v_approval
    FROM public.com_t_coach_monthly_report_approval
    WHERE coach_id = p_coach_id AND report_month = v_month
    FOR UPDATE;

    IF NOT FOUND OR v_approval.status <> 2 THEN
        RAISE EXCEPTION 'this monthly report is not approved';
    END IF;

    UPDATE public.com_t_coach_monthly_report_approval
    SET status = 1,
        session_count_snapshot = NULL,
        approved_by = NULL,
        approved_at = NULL,
        update_date = NOW()
    WHERE coach_id = p_coach_id AND report_month = v_month;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        p_coach_id,
        'COACH_REPORT_APPROVAL_REVOKED',
        jsonb_build_object('report_month', v_month),
        '/monthly-reports'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_coach_monthly_report_approval(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_coach_monthly_report_approval(uuid, date) TO authenticated;

---------------------------------------------
-- 16. 月次コーチングレポート: 月範囲判定のタイムゾーン修正 (2026-09-13 追加)
---------------------------------------------
-- 【背景】
-- 「コーチの当月における稼働実績」を測る指標であるにもかかわらず、月の境界判定が
-- UTC基準になっていた（初版のバグ）。get_coach_monthly_active_students/
-- get_coach_monthly_sessionsの月範囲をコーチ自身のタイムゾーン(com_m_user.timezone)基準に
-- 修正する。タイムゾーンはクライアントからパラメータで受け取らず、本関数が呼び出しの都度
-- com_m_userから直接参照する（呼び出し側が任意の値を詐称して境界を操作することを防ぐため）。
-- 承認済み月はcom_t_coach_monthly_report_approval.session_count_snapshotに固定保存される
-- ため、承認後のタイムゾーン変更は既に承認済みの集計を遡って変えない（影響があるとしても
-- 未承認の月の月境界付近のみ。アドミンが承認前にグリッドを目視確認することが最後の防波堤）。
-- 対応ファイル: function/get_coach_monthly_active_students.sql, function/get_coach_monthly_sessions.sql
-- （いずれもシグネチャ変更は無いためCREATE OR REPLACEのみ、DROP FUNCTIONは不要）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_monthly_active_students(p_coach_id uuid, p_report_month date)
RETURNS TABLE(student_id uuid, user_name text, icon_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_timezone text;
    v_month_start_utc timestamptz;
    v_month_end_utc timestamptz;
BEGIN
    IF auth.uid() <> p_coach_id AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to view this coach''s monthly report';
    END IF;

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo';
    END IF;

    v_month_start_utc := date_trunc('month', p_report_month::timestamp) AT TIME ZONE v_coach_timezone;
    v_month_end_utc := (date_trunc('month', p_report_month::timestamp) + interval '1 month') AT TIME ZONE v_coach_timezone;

    RETURN QUERY
    SELECT DISTINCT u.id, u.user_name, u.icon_path
    FROM public.com_m_coach_student_relationship r
    JOIN public.com_m_user u ON u.id = r.student_id
    WHERE r.coach_id = p_coach_id
      AND EXISTS (
          SELECT 1
          FROM public.com_t_user_license l
          JOIN public.com_m_contract c ON c.contract_id = l.contract_id
          WHERE l.user_id = r.student_id
            AND l.status = 1
            AND c.status = 1
            AND l.start_date <= v_month_end_utc
            AND l.end_date >= v_month_start_utc
      )
    ORDER BY u.user_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_active_students(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_active_students(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_coach_monthly_sessions(p_coach_id uuid, p_report_month date)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    status_note text,
    ticket_refunded boolean,
    counts_toward_total boolean,
    is_unresolved boolean,
    is_attention boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_timezone text;
    v_month_start_utc timestamptz;
    v_month_end_utc timestamptz;
BEGIN
    IF auth.uid() <> p_coach_id AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to view this coach''s monthly report';
    END IF;

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo';
    END IF;

    v_month_start_utc := date_trunc('month', p_report_month::timestamp) AT TIME ZONE v_coach_timezone;
    v_month_end_utc := (date_trunc('month', p_report_month::timestamp) + interval '1 month') AT TIME ZONE v_coach_timezone;

    RETURN QUERY
    SELECT
        s.session_id,
        s.student_id,
        s.start_datetime,
        s.end_datetime,
        s.status,
        s.status_note,
        s.ticket_refunded,
        (s.status IN (2, 6, 7) OR (s.status = 3 AND s.ticket_refunded = false)) AS counts_toward_total,
        (s.status = 1 AND s.end_datetime < NOW()) AS is_unresolved,
        (s.status IN (6, 7) OR (s.status = 3 AND s.ticket_refunded = false)) AS is_attention
    FROM public.com_t_session s
    WHERE s.coach_id = p_coach_id
      AND s.start_datetime >= v_month_start_utc
      AND s.start_datetime < v_month_end_utc
    ORDER BY s.student_id, s.start_datetime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) TO authenticated;

---------------------------------------------
-- 17. 月次コーチングレポート: 終了処理未実施セッションの承認ブロック (2026-09-13 追加)
---------------------------------------------
-- 【背景】
-- 終了処理未実施(is_unresolved=true)のセッションが残る月は実績が確定していないため、
-- アドミンが承認できないようにする。画面側（apps/admin ApprovalControlBar）でも同条件で
-- 承認ボタンを無効化するが、表示後の競合を防ぐためRPC側でも同じ判定を正の防御線として行う。
-- 対応ファイル: function/approve_coach_monthly_report.sql
-- （シグネチャ変更は無いためCREATE OR REPLACEのみ、DROP FUNCTIONは不要）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_coach_monthly_report(
    p_coach_id uuid,
    p_report_month date,
    p_approved_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month date := date_trunc('month', p_report_month)::date;
    v_snapshot jsonb;
    v_unresolved_count integer;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to approve this monthly report';
    END IF;

    SELECT COUNT(*) INTO v_unresolved_count
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month) s
    WHERE s.is_unresolved;

    IF v_unresolved_count > 0 THEN
        RAISE EXCEPTION 'cannot approve while % unresolved session(s) remain for this month', v_unresolved_count;
    END IF;

    SELECT jsonb_build_object(
        'total', COALESCE(SUM((counts_toward_total)::int), 0),
        'by_student', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('student_id', student_id, 'count', cnt))
             FROM (
                 SELECT student_id, SUM((counts_toward_total)::int) AS cnt
                 FROM public.get_coach_monthly_sessions(p_coach_id, v_month)
                 GROUP BY student_id
             ) per_student),
            '[]'::jsonb
        )
    )
    INTO v_snapshot
    FROM public.get_coach_monthly_sessions(p_coach_id, v_month);

    INSERT INTO public.com_t_coach_monthly_report_approval (
        coach_id, report_month, status, session_count_snapshot, approved_by, approved_at, update_date
    ) VALUES (
        p_coach_id, v_month, 2, v_snapshot, p_approved_by, NOW(), NOW()
    )
    ON CONFLICT (coach_id, report_month) DO UPDATE
    SET status = 2,
        session_count_snapshot = v_snapshot,
        approved_by = p_approved_by,
        approved_at = NOW(),
        update_date = NOW();

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        p_coach_id,
        'COACH_REPORT_APPROVED',
        jsonb_build_object('report_month', v_month),
        '/monthly-reports'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_coach_monthly_report(uuid, date, uuid) TO authenticated;

---------------------------------------------
-- 18. 月次コーチングレポート: 未来の予定セッションの除外 (2026-09-13 追加)
---------------------------------------------
-- 【背景】
-- get_coach_monthly_sessionsが、まだ実施されていない通常の予定(status=1で終了予定時刻を
-- 過ぎていない行)まで返していたため、グリッド上に「実績ではない件数」が表示され紛らわしい
-- というフィードバックを受けて修正する。カウント(counts_toward_total)・注意色(is_attention)
-- には元々影響しない（いずれも元々false）が、行自体を結果から除外する。
-- status=1で終了予定時刻を過ぎている行（is_unresolved=true、要対応）は除外しない。
-- 対応ファイル: function/get_coach_monthly_sessions.sql
-- （シグネチャ変更は無いためCREATE OR REPLACEのみ、DROP FUNCTIONは不要）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_monthly_sessions(p_coach_id uuid, p_report_month date)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    status_note text,
    ticket_refunded boolean,
    counts_toward_total boolean,
    is_unresolved boolean,
    is_attention boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_timezone text;
    v_month_start_utc timestamptz;
    v_month_end_utc timestamptz;
BEGIN
    IF auth.uid() <> p_coach_id AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to view this coach''s monthly report';
    END IF;

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo';
    END IF;

    v_month_start_utc := date_trunc('month', p_report_month::timestamp) AT TIME ZONE v_coach_timezone;
    v_month_end_utc := (date_trunc('month', p_report_month::timestamp) + interval '1 month') AT TIME ZONE v_coach_timezone;

    RETURN QUERY
    SELECT
        s.session_id,
        s.student_id,
        s.start_datetime,
        s.end_datetime,
        s.status,
        s.status_note,
        s.ticket_refunded,
        (s.status IN (2, 6, 7) OR (s.status = 3 AND s.ticket_refunded = false)) AS counts_toward_total,
        (s.status = 1 AND s.end_datetime < NOW()) AS is_unresolved,
        (s.status IN (6, 7) OR (s.status = 3 AND s.ticket_refunded = false)) AS is_attention
    FROM public.com_t_session s
    WHERE s.coach_id = p_coach_id
      AND s.start_datetime >= v_month_start_utc
      AND s.start_datetime < v_month_end_utc
      AND (s.status <> 1 OR s.end_datetime < NOW())
    ORDER BY s.student_id, s.start_datetime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) TO authenticated;

---------------------------------------------
-- 19. 月次コーチングレポート: 対象行の絞り込みを一般化 (2026-09-13 追加)
---------------------------------------------
-- 【背景】
-- 実コーチアカウント(タイムゾーンがAsia/Tokyo以外、America/Vancouver)での確認により、
-- 12h以上前の通常キャンセル(ticket_refunded=true)・コーチキャンセル・アドミン代理
-- キャンセル・振替済みの旧セッション等、実績としてカウントされない行がグリッド上に
-- 件数として表示され、「集計対象外なのに数字が出ている」「未来の日付に数字が出ている」
-- という混乱を招くことが判明した（前回の「18.」で対応した未来の予定セッションの除外と
-- 同種の問題）。整理した結果、本レポートに表示すべき行は「実施済みセッションが前提」で、
-- 未処理(is_unresolved)・完了(early_ended含む)・12時間以内キャンセル・No showの4種類の
-- みであるべきと結論づけ、対象行の絞り込み条件を
-- 「counts_toward_total=true（実績としてカウントする） または is_unresolved=true
-- （終了処理未実施、要対応）」に一般化する（is_attention=trueの行は必ず
-- counts_toward_total=trueの部分集合であるため、この条件のみで要対応・カウント対象の
-- 全パターンを包含する）。
-- 対応ファイル: function/get_coach_monthly_sessions.sql
-- （シグネチャ変更は無いためCREATE OR REPLACEのみ、DROP FUNCTIONは不要）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_monthly_sessions(p_coach_id uuid, p_report_month date)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    status_note text,
    ticket_refunded boolean,
    counts_toward_total boolean,
    is_unresolved boolean,
    is_attention boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_timezone text;
    v_month_start_utc timestamptz;
    v_month_end_utc timestamptz;
BEGIN
    IF auth.uid() <> p_coach_id AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to view this coach''s monthly report';
    END IF;

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo';
    END IF;

    v_month_start_utc := date_trunc('month', p_report_month::timestamp) AT TIME ZONE v_coach_timezone;
    v_month_end_utc := (date_trunc('month', p_report_month::timestamp) + interval '1 month') AT TIME ZONE v_coach_timezone;

    RETURN QUERY
    SELECT
        s.session_id,
        s.student_id,
        s.start_datetime,
        s.end_datetime,
        s.status,
        s.status_note,
        s.ticket_refunded,
        (s.status IN (2, 6, 7) OR (s.status = 3 AND s.ticket_refunded = false)) AS counts_toward_total,
        (s.status = 1 AND s.end_datetime < NOW()) AS is_unresolved,
        (s.status IN (6, 7) OR (s.status = 3 AND s.ticket_refunded = false)) AS is_attention
    FROM public.com_t_session s
    WHERE s.coach_id = p_coach_id
      AND s.start_datetime >= v_month_start_utc
      AND s.start_datetime < v_month_end_utc
      AND (
          (s.status IN (2, 6, 7) OR (s.status = 3 AND s.ticket_refunded = false))
          OR (s.status = 1 AND s.end_datetime < NOW())
      )
    ORDER BY s.student_id, s.start_datetime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) TO authenticated;
