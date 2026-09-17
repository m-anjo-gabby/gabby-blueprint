-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260911-dev
-- 作成日: 2026-09-11
-- 更新日: 2026-09-15（アドミンの振替(admin_reschedule_session)を廃止: 生徒・コーチ向けの
--          「振替」概念を廃止したのと同じく、アドミン専用の日時変更RPCも廃止し、
--          cancel_session(p_as_admin=true)＋admin_book_session_directの「キャンセル＋予約」の
--          2操作に統一した（マッチング〜予約管理ドメインの再整理の一環）。詳細はファイル末尾の
--          「31. アドミンの振替(admin_reschedule_session)の廃止」セクションのコメントを参照）
-- 更新日: 2026-09-15（スロット提案の統合: com_t_session_reschedule_proposal（キャンセル時の
--          振替候補、双方向・24時間期限）とcom_t_session_booking_request（生徒の自由予約
--          リクエスト、生徒のみ・無期限）を、同一概念（相手の承認/承諾を要する日時提案）として
--          com_t_session_slot_proposalへ一本化した。承認/却下RPCもapprove_slot_proposal/
--          reject_slot_proposalへ統合する（旧approve_session_booking_request/
--          reject_session_booking_request/accept_session_reschedule_proposal/
--          decline_session_reschedule_proposalsは削除）。作成側(create_session_booking_request/
--          cancel_session)とwithdraw_session_booking_requestはRPC名・シグネチャを変更せず、
--          内部の書き込み先テーブルのみ変更する。開発中のためデータ移行は行わず、旧テーブルは
--          そのままDROPする（本番未リリース）。詳細はファイル末尾の「30. スロット提案の統合」
--          セクションのコメントを参照）
-- 更新日: 2026-09-15（cancel_session(): admin-proxy判定の明示化。従来「auth.uid()が生徒とも
--          コーチとも一致しない」という消去法でアドミン代理操作を推測していたのを、呼び出し元が
--          明示的に渡す新パラメータp_as_admin（アドミン代理操作専用のcancelSessionAsAdminのみ
--          trueを渡す）に切り替えた。挙動は変更していない。詳細はファイル末尾の
--          「29. cancel_session: admin-proxy判定の明示化」セクションのコメントを参照）
-- 更新日: 2026-09-15（マッチング成立処理・一括キャンセル処理・チケット消費処理の共通化:
--          approve_matching_request()とadmin_match_student_with_coach()でほぼ丸ごと
--          重複していたマッチング成立ロジックをfn_commit_matching_schedule()に、
--          release_lesson_schedule_slot()とinvalidate_user_license()で重複していた
--          未実施セッション一括キャンセルをfn_cancel_future_sessions()に、
--          finalize_session()とresolve_stale_session()で重複していたチケット消費+
--          履歴記録のペアをfn_consume_session_ticket()に、それぞれ集約した。挙動は
--          変更していない。詳細はファイル末尾の「28. マッチング成立処理・一括キャンセル
--          処理・チケット消費処理の共通化」セクションのコメントを参照）
-- 更新日: 2026-09-15（権限チェック・通知INSERTの共通化: ライブセッション関連RPC群に
--          コピー&ペーストされていた「当事者本人またはアドミンのみ許可」の権限チェック
--          （約20箇所）と、com_t_notificationへのINSERT（約15箇所）を、それぞれ
--          fn_assert_actor_or_admin()/fn_assert_dual_actor_or_admin()/fn_notify()という
--          3つの共通ヘルパー関数に集約した。挙動は変更していない。詳細はファイル末尾の
--          「27. 権限チェック・通知INSERTの共通ヘルパー化」セクションのコメントを参照）
-- 更新日: 2026-09-15（安全性ギャップ修正: 生徒の個別予約・振替候補・マッチング承認による
--          初回セッションが、いずれも「開始24時間以内は予約不可」という仕様上のルールを
--          RPC側で強制できていなかった（UI上の参考表示のみで、サーバー側の検証が
--          漏れていた）。アドミン代理操作は対象外（従来通り未来であればいつでも可能）。
--          詳細はファイル末尾の「26. 個別予約・振替候補・マッチング承認への24時間ルール適用」
--          セクションのコメントを参照）
--          2026-09-12のパッチで部分一意インデックス化されたuq_session_schedule_datetimeと
--          一致しなくなっており、本関数を経由するセッション生成が全件失敗する状態だった。
--          データ主体テスト中に発見。詳細はファイル末尾の「25. ON CONFLICT対象と
--          一意インデックスの不一致修正」セクションのコメントを参照）
-- 更新日: 2026-09-14（com_t_session.statusを1〜10からscheduled/completed/cancelledの
--          3値に簡素化し、完了時の内訳(completion_result)・キャンセルの起因
--          (cancel_category)を直交する列に分離。詳細はファイル末尾の「24. セッション
--          ステータスの簡素化」セクションのコメントを参照）
-- 更新日: 2026-09-14（コマ別セッション目標数(target_sessions)を追加。マッチング承認が
--          契約開始から遅れると、そのコマの生成本数が契約上のtotal_sessions/
--          weekly_frequency均等割り値を恒久的に下回り、かつ不足自体も検知できなかった
--          問題に対応する。詳細はファイル末尾の「23. コマ別セッション目標数
--          (target_sessions)の追加」セクションのコメントを参照）
-- 更新日: 2026-09-14（コーチ「申請一覧」画面のHistoryをmatching/booking/reschedule_proposalの
--          3タブに分割し、各タブをinsert_dateカーソルでページング取得する方式に変更した
--          （旧: 3種類を1画面にマージし全件を一括取得後、クライアント側で表示件数だけ絞る方式）。
--          あわせてPending Requestsパネル・サイドバー未処理件数バッジ用に、status=pendingのみを
--          取得する軽量クエリを新設した。coach_id絞り込みは既存の(coach_id, status)インデックスで
--          足りるが、History側のinsert_date降順カーソルページングを支えるインデックスが
--          3テーブルとも無かったため追加する。詳細はファイル末尾の「22. コーチ申請履歴の
--          ページング用インデックス追加」セクションのコメントを参照）
-- 更新日: 2026-09-13（会社ロゴをapps/coach/public直参照からSupabase Storage
--          ("company-logo"バケット)参照へ変更。詳細はファイル末尾の「21. 会社ロゴの
--          Storage移行」セクションのコメントを参照）
-- 更新日: 2026-09-13（コーチ向け月次支払通知書(PDF)機能を追加。会社情報・セッション単価の
--          マスタを新設し、承認時に単価をスナップショット保存する。詳細はファイル末尾の
--          「20. コーチ向け月次支払通知書(PDF)機能」セクションのコメントを参照）
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

---------------------------------------------
-- 20. コーチ向け月次支払通知書(PDF)機能 (2026-09-13 追加)
---------------------------------------------
-- 会社情報・セッション単価のマスタを新設し、承認時に単価をスナップショット保存した上で、
-- コーチ自身が承認済み月の支払通知書PDFをダウンロードできるようにする。
-- 対応ファイル: table/com_m_company_profile.sql, table/com_m_session_pay_rate.sql,
--   table/com_t_coach_monthly_report_approval.sql(ALTER), function/approve_coach_monthly_report.sql,
--   function/revoke_coach_monthly_report_approval.sql, DML/com_m_company_profile.sql,
--   DML/com_m_session_pay_rate.sql
---------------------------------------------

---------------------------------------------
-- DDL: com_m_company_profile (会社情報マスタ) (2026-09-13 追加)
---------------------------------------------
CREATE TABLE public.com_m_company_profile (
    company_profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name text NOT NULL,
    address text NOT NULL,
    logo_path text,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_company_profile IS '会社情報マスタ（コーチ向け月次支払通知書PDFに使用。運用上は常に1行のみ）';
COMMENT ON COLUMN public.com_m_company_profile.company_profile_id IS '会社情報ID';
COMMENT ON COLUMN public.com_m_company_profile.company_name IS '会社名（例: Gabby Academy Co., Ltd.）';
COMMENT ON COLUMN public.com_m_company_profile.address IS '住所（PDF印字用、複数行は改行区切り）';
COMMENT ON COLUMN public.com_m_company_profile.logo_path IS 'ロゴ画像のパス（apps/coach/public配下の相対パス、例: /logo-01.png）';
COMMENT ON COLUMN public.com_m_company_profile.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_company_profile.update_date IS '更新日時';

ALTER TABLE public.com_m_company_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage company profile" ON public.com_m_company_profile;

CREATE POLICY "Admins can manage company profile" ON public.com_m_company_profile
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

---------------------------------------------
-- DDL: com_m_session_pay_rate (セッション単価マスタ) (2026-09-13 追加)
---------------------------------------------
CREATE TABLE public.com_m_session_pay_rate (
    session_pay_rate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_amount numeric(10, 2) NOT NULL,
    currency_code text NOT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_pay_rate_positive CHECK (rate_amount >= 0)
);

COMMENT ON TABLE public.com_m_session_pay_rate IS 'セッション単価マスタ（全コーチ共通、現在値のみ保持。コーチ向け月次支払通知書PDFの支払額算出に使用）';
COMMENT ON COLUMN public.com_m_session_pay_rate.session_pay_rate_id IS '単価ID';
COMMENT ON COLUMN public.com_m_session_pay_rate.rate_amount IS '1セッションあたりの支払単価';
COMMENT ON COLUMN public.com_m_session_pay_rate.currency_code IS '通貨コード（例: CAD, USD, JPY）';
COMMENT ON COLUMN public.com_m_session_pay_rate.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_session_pay_rate.update_date IS '更新日時';

ALTER TABLE public.com_m_session_pay_rate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage session pay rate" ON public.com_m_session_pay_rate;

CREATE POLICY "Admins can manage session pay rate" ON public.com_m_session_pay_rate
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

---------------------------------------------
-- DML: 初期データ投入（冪等、固定IDでのUPSERT）
---------------------------------------------
INSERT INTO public.com_m_company_profile (company_profile_id, company_name, address, logo_path) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Gabby Academy Co., Ltd.',
    '2-25-2F, Kandasudacho, Chiyoda-ku' || E'\n' || 'Tokyo Japan 101-0041',
    '/logo-01.png'
  )
ON CONFLICT (company_profile_id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  address = EXCLUDED.address,
  logo_path = EXCLUDED.logo_path,
  update_date = NOW();

INSERT INTO public.com_m_session_pay_rate (session_pay_rate_id, rate_amount, currency_code) VALUES
  ('00000000-0000-0000-0000-000000000001', 15.00, 'CAD')
ON CONFLICT (session_pay_rate_id) DO UPDATE SET
  rate_amount = EXCLUDED.rate_amount,
  currency_code = EXCLUDED.currency_code,
  update_date = NOW();

---------------------------------------------
-- 追加パッチ: 支払通知書PDF向け単価スナップショット (2026-09-13 追加)
---------------------------------------------
ALTER TABLE public.com_t_coach_monthly_report_approval
  ADD COLUMN IF NOT EXISTS rate_amount numeric(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rate_currency text DEFAULT NULL;

COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.rate_amount IS '承認時点のセッション単価スナップショット（com_m_session_pay_rateより。承認取消し時にNULLへ戻す）';
COMMENT ON COLUMN public.com_t_coach_monthly_report_approval.rate_currency IS '承認時点の通貨コードスナップショット（例: CAD）';

---------------------------------------------
-- approve_coach_monthly_report / revoke_coach_monthly_report_approval の更新
-- （単価スナップショットの保存/クリアを追加。シグネチャ変更は無いためCREATE OR REPLACEのみ）
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
    v_rate_amount numeric(10, 2);
    v_rate_currency text;
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

    SELECT rate_amount, currency_code INTO v_rate_amount, v_rate_currency
    FROM public.com_m_session_pay_rate
    ORDER BY update_date DESC
    LIMIT 1;

    INSERT INTO public.com_t_coach_monthly_report_approval (
        coach_id, report_month, status, session_count_snapshot, rate_amount, rate_currency, approved_by, approved_at, update_date
    ) VALUES (
        p_coach_id, v_month, 2, v_snapshot, v_rate_amount, v_rate_currency, p_approved_by, NOW(), NOW()
    )
    ON CONFLICT (coach_id, report_month) DO UPDATE
    SET status = 2,
        session_count_snapshot = v_snapshot,
        rate_amount = v_rate_amount,
        rate_currency = v_rate_currency,
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
        rate_amount = NULL,
        rate_currency = NULL,
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
-- 21. 会社ロゴのStorage移行 (2026-09-13 追加)
---------------------------------------------
-- 【背景】
-- com_m_company_profile.logo_pathがapps/coach/public配下の相対パス("/logo-01.png")を
-- 直接参照する方式では、アドミンが実際にロゴ画像を差し替えることができない
-- （テキスト欄で任意の文字列を入力できても、対応する画像ファイルは無いため）。
-- 会社情報マスタを新設した趣旨（アドミンが実データを管理できること）に合わせ、
-- 新規Storageバケット"company-logo"(Public運用、country-flagバケットと同方針)へ移行し、
-- logo_pathはバケット内の相対パス（例: logo-01.png）を保持する形に変更する。
-- 既存のapps/coach/public/logo-01.pngの内容をバケットへアップロード済み。
-- 対応ファイル: storage/company_logo_bucket.sql, DML/com_m_company_profile.sql(更新)
---------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logo',
  'company-logo',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO public.com_m_company_profile (company_profile_id, company_name, address, logo_path) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Gabby Academy Co., Ltd.',
    '2-25-2F, Kandasudacho, Chiyoda-ku' || E'\n' || 'Tokyo Japan 101-0041',
    'logo-01.png'
  )
ON CONFLICT (company_profile_id) DO UPDATE SET
  logo_path = EXCLUDED.logo_path,
  update_date = NOW();


---------------------------------------------
-- 22. コーチ申請履歴のページング用インデックス追加 (2026-09-14 追加)
---------------------------------------------
-- 【背景】
-- コーチ「申請一覧」画面のHistoryを、matching/booking/reschedule_proposalの3タブに分割し、
-- 各タブをinsert_dateカーソル（coach_id絞り込み + insert_date降順 + LIMIT）でページング
-- 取得する方式に変更した（詳細はapps/coach側の変更を参照。本SQLの対象外）。
-- 3テーブルとも既存インデックスは(coach_id, status)のみで、statusを問わず全件を対象に
-- insert_date降順でページングするこのクエリ形状には最適化されていなかったため、
-- (coach_id, insert_date DESC)の複合インデックスを追加する。
-- Pending Requestsパネル・サイドバーの未処理件数バッジ用に新設したstatus=pendingのみの
-- 軽量クエリは、既存の(coach_id, status)インデックスで引き続き足りるため対象外。
---------------------------------------------
CREATE INDEX IF NOT EXISTS idx_matching_request_coach_insert_date ON public.com_t_matching_request (coach_id, insert_date DESC);
CREATE INDEX IF NOT EXISTS idx_session_booking_request_coach_insert_date ON public.com_t_session_booking_request (coach_id, insert_date DESC);
CREATE INDEX IF NOT EXISTS idx_session_reschedule_proposal_coach_insert_date ON public.com_t_session_reschedule_proposal (coach_id, insert_date DESC);


---------------------------------------------
-- 24. セッションステータスの簡素化 (2026-09-14 追加)
---------------------------------------------
-- 【背景】
-- com_t_session.statusが1〜10まで増殖し、「完了時の内訳」（completed/no_show/
-- early_ended）と「キャンセルの起因」（student/coach/license_ended/coach_reassigned/
-- admin/旧reschedule）が同じ列にフラットに混在していた。実際には以下の2軸に分解できる。
--   1. 完了時の内訳: コーチがビデオ通話可能な状態で臨んだという点でどれも
--      「完了(completed)」であり、月次コーチング報酬の対象判定
--      (get_coach_monthly_sessions)でも既に3つとも同じ扱いだった
--      （実態が先行し、statusの設計が追いついていなかった）。
--   2. キャンセルの起因: 返還有無は既存のticket_refundedで表現できるが、
--      「誰が/なぜ」（生徒本人/コーチ本人/ライセンス無効化/コーチ交代/アドミン代理）は
--      月次コーチングレポートの内訳表示等で個別のラベルが必要なため、新設の
--      cancel_categoryで表現する（cancelled_by(実行者user_id)だけでは、
--      ライセンス無効化・コーチ交代・アドミン代理キャンセルがいずれも運用者側の
--      user_idになり互いに区別できないため）。
-- ライブセッション機能・コーチ機能はまだ本番運用しておらず、既存データは開発・
-- 検証用のみのため、旧status値の意味的な後方互換は取らずクリーンに移行する。
--
-- 【廃止するstatus値の移行先】
--   2:completed, 6:no_show, 7:early_ended
--     → status=2, completion_result=1(normal)/3(no_show)/2(early_ended)
--   3:cancelled_by_student → status=3, cancel_category=1(student)
--   4:cancelled_by_coach → status=3, cancel_category=2(coach)
--   5:rescheduled（admin_reschedule_session由来。旧振替概念自体は廃止済みだが、
--     rescheduled_fromで他行から参照されている可能性がありDELETEはFK違反の
--     リスクがあるため、他のadmin起因キャンセルと同様に統合する）
--     → status=3, cancel_category=3(admin)
--   8:cancelled_license_ended → status=3, cancel_category=4(license_ended)
--   9:cancelled_coach_reassigned → status=3, cancel_category=5(coach_reassigned)
--   10:cancelled_by_admin → status=3, cancel_category=3(admin)
--
-- 【変更対象】
--   1. com_t_session.completion_result / cancel_category カラムを追加（既存行は
--      上記マッピングで一括移行し、statusを1/2/3に集約。CHECK制約も締め直す）
--   2. finalize_session() / resolve_stale_session()
--      statusは常に2(completed)を確定し、内訳はcompletion_resultに書く
--      （used_sessions加算は従来どおりcompletion_result=1(normal)の場合のみ）。
--      いずれも戻り値・パラメータの意味が変わるためDROP FUNCTION IF EXISTS後に再作成。
--   3. cancel_session()
--      statusは常に3(cancelled)を確定し、起因はcancel_categoryに書く。
--   4. admin_reschedule_session() / release_lesson_schedule_slot() /
--      invalidate_user_license()
--      旧5/9/8のstatus直書きを、status=3 + 対応するcancel_categoryに変更。
--   5. fn_schedule_shortfall() / get_coach_monthly_sessions()
--      actual/counts_toward_total/is_attentionの判定式を新しいstatus値に追従。
--      get_coach_monthly_sessionsはcompletion_result/cancel_categoryを新設の
--      出力列として追加するためDROP FUNCTION IF EXISTS後に再作成。
--
-- 呼び出し元のTypeScript（packages/types/session.ts, packages/types/monthlyReport.ts,
-- packages/lib/session/actions/sessionActions.ts,
-- packages/lib/coachStudent/actions/coachStudentActions.ts,
-- packages/lib/monthlyReport/actions/monthlyReportActions.ts,
-- packages/lib/components/common/SessionActionDialog.tsx、および
-- apps/{admin,coach,student}側のステータスラベル・バッジ・変更履歴フィルタ）は
-- 本SQLの対象外（別途アプリケーションコードを更新済み）。
---------------------------------------------
ALTER TABLE public.com_t_session
  ADD COLUMN IF NOT EXISTS completion_result smallint,
  ADD COLUMN IF NOT EXISTS cancel_category smallint;

UPDATE public.com_t_session
SET completion_result = CASE status WHEN 2 THEN 1 WHEN 7 THEN 2 WHEN 6 THEN 3 END
WHERE status IN (2, 6, 7);

UPDATE public.com_t_session
SET cancel_category = CASE status
    WHEN 3 THEN 1   -- student
    WHEN 4 THEN 2   -- coach
    WHEN 5 THEN 3   -- admin (旧reschedule。admin_reschedule_session由来)
    WHEN 10 THEN 3  -- admin
    WHEN 8 THEN 4   -- license_ended
    WHEN 9 THEN 5   -- coach_reassigned
END
WHERE status IN (3, 4, 5, 8, 9, 10);

UPDATE public.com_t_session SET status = 2 WHERE status IN (6, 7);
UPDATE public.com_t_session SET status = 3 WHERE status IN (4, 5, 8, 9, 10);

ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_status;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_status CHECK (status IN (1, 2, 3));

ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_completion_result;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_completion_result CHECK (
    (status = 2 AND completion_result IN (1, 2, 3)) OR (status <> 2 AND completion_result IS NULL)
);

ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_cancel_category;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_cancel_category CHECK (
    (status = 3 AND cancel_category IN (1, 2, 3, 4, 5)) OR (status <> 3 AND cancel_category IS NULL)
);

COMMENT ON COLUMN public.com_t_session.status IS 'ステータス 1:scheduled 2:completed(内訳はcompletion_result参照) 3:cancelled(起因はcancel_category、返還有無はticket_refundedを参照)';
COMMENT ON COLUMN public.com_t_session.completion_result IS 'status=2(completed)の内訳。1:normal(正常終了、20分以上) 2:early_ended(早期終了、20分未満だが生徒入室あり。理由はstatus_note) 3:no_show(生徒欠席、入室記録なし)。status<>2の行では常にNULL。';
COMMENT ON COLUMN public.com_t_session.cancel_category IS 'status=3(cancelled)の起因。1:student(生徒本人) 2:coach(コーチ本人) 3:admin(アドミン代理操作・旧reschedule含む) 4:license_ended(ライセンス無効化による自動キャンセル) 5:coach_reassigned(コーチ交代による自動キャンセル)。status<>3の行では常にNULL。返還有無はticket_refundedを別途参照。';

DROP FUNCTION IF EXISTS public.finalize_session(uuid, text);

CREATE OR REPLACE FUNCTION public.finalize_session(p_session_id uuid, p_early_end_reason text DEFAULT NULL)
RETURNS TABLE(new_status smallint, completion_result smallint, overlap_seconds integer, student_joined boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_overlap_seconds numeric;
    v_student_joined boolean;
    v_completion_result smallint;
    v_ticket RECORD;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id <> auth.uid() THEN
        RAISE EXCEPTION 'not authorized to finalize this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    SELECT COALESCE(SUM(GREATEST(0,
             EXTRACT(EPOCH FROM (LEAST(c.left_end, s.left_end) - GREATEST(c.joined_at, s.joined_at)))
           )), 0)
      INTO v_overlap_seconds
      FROM (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
              FROM public.com_t_session_call_log
              WHERE session_id = p_session_id AND role = 'coach') c
      CROSS JOIN (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
                    FROM public.com_t_session_call_log
                    WHERE session_id = p_session_id AND role = 'student') s;

    SELECT EXISTS(
      SELECT 1 FROM public.com_t_session_call_log WHERE session_id = p_session_id AND role = 'student'
    ) INTO v_student_joined;

    IF v_overlap_seconds >= 1200 THEN -- 20分
        v_completion_result := 1; -- normal
    ELSIF v_student_joined THEN
        IF p_early_end_reason IS NULL OR btrim(p_early_end_reason) = '' THEN
            RAISE EXCEPTION 'reason required for early-ended session';
        END IF;
        v_completion_result := 2; -- early_ended
    ELSE
        v_completion_result := 3; -- no_show
    END IF;

    UPDATE public.com_t_session
    SET status = 2, completion_result = v_completion_result,
        status_note = CASE WHEN v_completion_result = 2 THEN p_early_end_reason ELSE NULL END,
        update_date = NOW()
    WHERE session_id = p_session_id;

    IF v_completion_result = 1 THEN
        UPDATE public.com_t_user_session_ticket
        SET used_sessions = used_sessions + 1, update_date = NOW()
        WHERE ticket_id = v_session.ticket_id
        RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

        IF FOUND THEN
            INSERT INTO public.com_t_user_session_ticket_history
                (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
            VALUES
                (v_session.ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, NULL, auth.uid());
        END IF;
    END IF;

    RETURN QUERY SELECT 2::smallint, v_completion_result, v_overlap_seconds::integer, v_student_joined;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_session(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.resolve_stale_session(uuid, smallint, text);

CREATE OR REPLACE FUNCTION public.resolve_stale_session(p_session_id uuid, p_completion_result smallint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_ticket RECORD;
BEGIN
    IF p_completion_result NOT IN (1, 2, 3) THEN
        RAISE EXCEPTION 'invalid completion result %', p_completion_result;
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason required to resolve a stale session';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to resolve this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.end_datetime > NOW() THEN
        RAISE EXCEPTION 'cannot resolve a session before its end time';
    END IF;

    UPDATE public.com_t_session
    SET status = 2, completion_result = p_completion_result, status_note = p_reason, update_date = NOW()
    WHERE session_id = p_session_id;

    IF p_completion_result = 1 THEN
        UPDATE public.com_t_user_session_ticket
        SET used_sessions = used_sessions + 1, update_date = NOW()
        WHERE ticket_id = v_session.ticket_id
        RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

        IF FOUND THEN
            INSERT INTO public.com_t_user_session_ticket_history
                (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
            VALUES
                (v_session.ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, p_reason, auth.uid());
        END IF;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) TO authenticated;

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
    v_cancel_category smallint;
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
        v_cancel_category := 3; -- admin
        v_refunded := p_admin_refund_ticket;
    ELSIF v_session.student_id = auth.uid() THEN
        v_cancel_category := 1; -- student
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_cancel_category := 2; -- coach
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = 3, cancel_category = v_cancel_category, cancel_reason = p_reason, cancelled_by = auth.uid(),
        ticket_refunded = v_refunded, update_date = NOW()
    WHERE session_id = p_session_id;

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_session.coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_session.student_id;

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
    SET status = 3, cancel_category = 3, cancel_reason = p_reason, cancelled_by = auth.uid(), update_date = NOW()
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

CREATE OR REPLACE FUNCTION public.release_lesson_schedule_slot(p_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to release a lesson schedule slot';
    END IF;

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    UPDATE public.com_m_lesson_schedule
    SET status = 9, update_date = NOW()
    WHERE schedule_id = p_schedule_id;

    IF v_schedule.source_request_id IS NOT NULL THEN
        UPDATE public.com_t_matching_request
        SET status = 5, update_date = NOW()
        WHERE request_id = v_schedule.source_request_id AND status = 2;
    END IF;

    UPDATE public.com_t_session
    SET status = 3,
        cancel_category = 5, -- coach_reassigned
        cancel_reason = 'コーチ交代のため',
        cancelled_by = auth.uid(),
        update_date = NOW()
    WHERE schedule_id = p_schedule_id AND status = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.invalidate_user_license(p_license_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_license RECORD;
    v_ticket_id uuid;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to invalidate a license';
    END IF;

    SELECT * INTO v_license FROM public.com_t_user_license WHERE license_id = p_license_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'license % not found', p_license_id;
    END IF;

    IF v_license.status <> 1 THEN
        RAISE EXCEPTION 'license % is not active (status=%)', p_license_id, v_license.status;
    END IF;

    UPDATE public.com_t_user_license
    SET status = 0, update_date = NOW()
    WHERE license_id = p_license_id;

    SELECT ticket_id INTO v_ticket_id
    FROM public.com_t_user_session_ticket
    WHERE license_id = p_license_id;

    IF v_ticket_id IS NOT NULL THEN
        UPDATE public.com_m_lesson_schedule
        SET status = 9, update_date = NOW()
        WHERE ticket_id = v_ticket_id AND status = 1;

        UPDATE public.com_t_session
        SET status = 3,
            cancel_category = 4, -- license_ended
            cancel_reason = 'ライセンス無効化のため',
            cancelled_by = auth.uid(),
            update_date = NOW()
        WHERE ticket_id = v_ticket_id AND status = 1;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invalidate_user_license(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invalidate_user_license(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_schedule_shortfall(p_schedule_id uuid)
RETURNS TABLE(expected_sessions integer, actual_sessions integer, shortfall integer)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_expected integer;
    v_actual integer;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    v_expected := v_schedule.target_sessions;

    SELECT COUNT(*) INTO v_actual
    FROM public.com_t_session s
    WHERE s.schedule_id = p_schedule_id
      AND (
        s.status IN (1, 2)
        OR (s.status = 3 AND s.ticket_refunded = false)
      );

    RETURN QUERY SELECT v_expected, v_actual, GREATEST(v_expected - v_actual, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schedule_shortfall(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_schedule_shortfall(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_coach_monthly_sessions(uuid, date);

CREATE OR REPLACE FUNCTION public.get_coach_monthly_sessions(p_coach_id uuid, p_report_month date)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    completion_result smallint,
    cancel_category smallint,
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
        s.completion_result,
        s.cancel_category,
        s.status_note,
        s.ticket_refunded,
        (s.status = 2 OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) AS counts_toward_total,
        (s.status = 1 AND s.end_datetime < NOW()) AS is_unresolved,
        ((s.status = 2 AND s.completion_result IN (2, 3)) OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) AS is_attention
    FROM public.com_t_session s
    WHERE s.coach_id = p_coach_id
      AND s.start_datetime >= v_month_start_utc
      AND s.start_datetime < v_month_end_utc
      AND (
          (s.status = 2 OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false))
          OR (s.status = 1 AND s.end_datetime < NOW())
      )
    ORDER BY s.student_id, s.start_datetime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) TO authenticated;


---------------------------------------------
-- 23. コマ別セッション目標数(target_sessions)の追加 (2026-09-14 追加)
---------------------------------------------
-- 【背景】
-- fn_generate_sessions_for_schedule()は承認日時(GREATEST(license_start, CURRENT_DATE))から
-- ライセンス終了日までの間に対象曜日が出現する回数だけセッションを生成しており、
-- 契約上のtotal_sessions/weekly_frequency（例: 週2回24セッションなら1コマ12）を
-- 目標値として意識していなかった。そのため、マッチング承認が契約開始から遅れるほど
-- そのコマの生成本数が恒久的に目標を下回り、かつfn_schedule_shortfall()の期待値も
-- 同じ暦週計算で導出していたため乖離自体を検知できなかった（コーチ生徒概要画面で
-- 週2回契約・1コマ目のみマッチング済みのケースで、本来12であるべきTotalが11と
-- 表示される事象として顕在化）。契約上のエンタイトルメントをcom_m_lesson_schedule.
-- target_sessionsとして承認時に確定・保持し、以後の生成上限・不足判定の唯一の
-- 真実源とする。
--
-- 【端数の配分】
-- total_sessions / weekly_frequency の商をbaseとし、余りはslot_no昇順(1コマ目から順)に
-- 1つずつ多く配分する（例: 週3回25セッションなら1コマ目9・2コマ目8・3コマ目8）。
--
-- 【契約終了日を超える不足の扱い】
-- end_date到達時点でtarget_sessionsに満たない場合でも自動延長はしない。不足は
-- fn_schedule_shortfall()のshortfallとして可視化するのみとし、埋めるかどうかは
-- コーチ・アドミンの運用判断（既存のcreate_session_booking_request等）に委ねる。
--
-- 【変更対象】
--   1. com_m_lesson_schedule.target_sessions カラムを追加（既存行は一括バックフィル）
--   2. approve_matching_request() / admin_match_student_with_coach()
--      承認時にtarget_sessionsを算出しcom_m_lesson_schedule作成時に確定する
--   3. fn_generate_sessions_for_schedule()
--      生成件数がtarget_sessionsに達したら（end_date未到達でも）打ち切る
--   4. fn_schedule_shortfall()
--      expected_sessionsを暦週の数え上げからtarget_sessionsの参照に変更
--
-- 呼び出し元（packages/lib/coachStudent/actions/coachStudentActions.ts の
-- computeStudentContractSessionSummary/fetchOwnScheduleShortfalls、
-- packages/lib/matching/actions/matchingActions.ts の getMyBookableTicketsCore）は
-- RPCの返り値の意味が是正されるのみで、TypeScript側の変更は不要。
---------------------------------------------
ALTER TABLE public.com_m_lesson_schedule
  ADD COLUMN IF NOT EXISTS target_sessions smallint;

-- 既存行を、対象チケットのtotal_sessions/weekly_frequencyから同じ端数配分ルールで一括バックフィルする
UPDATE public.com_m_lesson_schedule s
SET target_sessions = (t.total_sessions / t.weekly_frequency)
    + CASE WHEN s.slot_no <= (t.total_sessions % t.weekly_frequency) THEN 1 ELSE 0 END
FROM public.com_t_user_session_ticket t
WHERE s.ticket_id = t.ticket_id AND s.target_sessions IS NULL;

ALTER TABLE public.com_m_lesson_schedule ALTER COLUMN target_sessions SET NOT NULL;

ALTER TABLE public.com_m_lesson_schedule DROP CONSTRAINT IF EXISTS chk_lesson_schedule_target_sessions;
ALTER TABLE public.com_m_lesson_schedule ADD CONSTRAINT chk_lesson_schedule_target_sessions CHECK (target_sessions >= 1);

COMMENT ON COLUMN public.com_m_lesson_schedule.target_sessions IS 'このコマ(slot_no)が契約上持つべき目標セッション数。承認時にtotal_sessions/weekly_frequencyの均等割り(余りはslot_no昇順に配分)で確定し、以後は不変。fn_generate_sessions_for_schedule()の生成上限、fn_schedule_shortfall()の期待値として使う唯一の真実源。';

CREATE OR REPLACE FUNCTION public.approve_matching_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_coach_timezone text;
    v_schedule_id uuid;
    v_coach_name text;
    v_ticket_total_sessions smallint;
    v_ticket_weekly_frequency smallint;
    v_target_sessions smallint;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    IF v_request.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to approve this request';
    END IF;

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    -- 対象チケットに紐づくライセンス期間(Session生成範囲の基準)と、target_sessions算出用の
    -- total_sessions/weekly_frequencyを取得
    SELECT l.start_date::date, l.end_date::date, t.total_sessions, t.weekly_frequency
    INTO v_license_start, v_license_end, v_ticket_total_sessions, v_ticket_weekly_frequency
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = v_request.ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', v_request.ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    -- このコマ(slot_no)が契約上持つべき目標セッション数。商をbaseとし、余りはslot_no昇順に
    -- 1つずつ多く配分する（table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）
    v_target_sessions := (v_ticket_total_sessions / v_ticket_weekly_frequency)
        + CASE WHEN v_request.slot_no <= (v_ticket_total_sessions % v_ticket_weekly_frequency) THEN 1 ELSE 0 END;

    -- 同一コーチ×同一曜日への承認を直列化し、重複チェックのレース条件を防ぐ
    PERFORM pg_advisory_xact_lock(hashtextextended(v_request.coach_id::text || ':' || v_request.requested_day_of_week::text, 0));

    IF public.check_coach_schedule_conflict(
        v_request.coach_id, v_request.requested_day_of_week,
        v_request.requested_start_time, v_request.requested_end_time,
        v_start_date, v_license_end
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_CONFLICT: coach % already has an overlapping active schedule', v_request.coach_id;
    END IF;

    -- day_of_week/start_time/end_timeの解釈基準として、承認時点のコーチtimezoneを固定保持する
    -- （以後コーチがプロフィールのtimezoneを変更しても、この契約の意味は変わらない）
    SELECT timezone INTO v_coach_timezone FROM public.com_m_user WHERE id = v_request.coach_id;
    v_coach_timezone := COALESCE(v_coach_timezone, 'Asia/Tokyo');

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        coach_timezone, status, start_date, end_date, source_request_id, target_sessions
    ) VALUES (
        v_request.ticket_id, v_request.student_id, v_request.coach_id, v_request.slot_no,
        v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, v_request.request_id, v_target_sessions
    )
    RETURNING schedule_id INTO v_schedule_id;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id);

    -- 生徒へ、マッチング成立を通知する（コーチは自ら承認操作を行ったため通知不要）
    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        v_request.student_id,
        'MATCHING_APPROVED',
        jsonb_build_object('coach_name', v_coach_name, 'schedule_id', v_schedule_id),
        '/live-room'
    );

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;

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
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_coach_timezone text;
    v_schedule_id uuid;
    v_request_id uuid;
    v_coach_name text;
    v_student_name text;
    v_ticket_total_sessions smallint;
    v_ticket_weekly_frequency smallint;
    v_target_sessions smallint;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to perform admin matching';
    END IF;

    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    -- 対象チケットに紐づくライセンス期間(Session生成範囲の基準)と、target_sessions算出用の
    -- total_sessions/weekly_frequencyを取得
    SELECT l.start_date::date, l.end_date::date, t.total_sessions, t.weekly_frequency
    INTO v_license_start, v_license_end, v_ticket_total_sessions, v_ticket_weekly_frequency
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    -- このコマ(slot_no)が契約上持つべき目標セッション数（approve_matching_requestと同じ算出式。
    -- table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）
    v_target_sessions := (v_ticket_total_sessions / v_ticket_weekly_frequency)
        + CASE WHEN p_slot_no <= (v_ticket_total_sessions % v_ticket_weekly_frequency) THEN 1 ELSE 0 END;

    -- 同一コーチ×同一曜日への処理を直列化し、重複チェックのレース条件を防ぐ
    -- （approve_matching_requestと同じロック）
    PERFORM pg_advisory_xact_lock(hashtextextended(p_coach_id::text || ':' || p_day_of_week::text, 0));

    IF public.check_coach_schedule_conflict(
        p_coach_id, p_day_of_week, p_start_time, p_end_time, v_start_date, v_license_end
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_CONFLICT: coach % already has an overlapping active schedule', p_coach_id;
    END IF;

    SELECT timezone INTO v_coach_timezone FROM public.com_m_user WHERE id = p_coach_id;
    v_coach_timezone := COALESCE(v_coach_timezone, 'Asia/Tokyo');

    -- 生徒の申請・コーチの承認を経ずに、承認済みのリクエストを直接作成する
    INSERT INTO public.com_t_matching_request (
        ticket_id, student_id, coach_id, slot_no, requested_day_of_week, requested_start_time, requested_end_time,
        status, responded_by, responded_at
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        2, auth.uid(), NOW()
    )
    RETURNING request_id INTO v_request_id;

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        coach_timezone, status, start_date, end_date, source_request_id, target_sessions
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, v_request_id, v_target_sessions
    )
    RETURNING schedule_id INTO v_schedule_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id);

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = p_coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_student_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES
        (v_student_id, 'MATCHING_APPROVED', jsonb_build_object('coach_name', v_coach_name, 'schedule_id', v_schedule_id), '/live-room'),
        (p_coach_id, 'MATCHING_ASSIGNED_TO_COACH', jsonb_build_object('student_name', v_student_name, 'schedule_id', v_schedule_id), '/students/' || v_student_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_generate_sessions_for_schedule(p_schedule_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_coach_tz text;
    v_cursor_date date;
    v_start_ts timestamptz;
    v_end_ts timestamptz;
    v_generated_count integer := 0;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    -- com_m_user.timezoneはライブ参照しない（上記【タイムゾーン変換】コメント参照）
    v_coach_tz := v_schedule.coach_timezone;

    -- start_date以降で最初にday_of_weekと一致する日付を求める
    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date AND v_generated_count < v_schedule.target_sessions LOOP
        -- 当該日・当該コーチのBLOCK例外（時間帯重複）が無いことを確認
        IF NOT EXISTS (
            SELECT 1 FROM public.com_t_coach_availability_exception e
            WHERE e.coach_id = v_schedule.coach_id
              AND e.exception_date = v_cursor_date
              AND e.exception_type = 'BLOCK'
              AND e.start_time < v_schedule.end_time
              AND e.end_time > v_schedule.start_time
        ) THEN
            v_start_ts := (v_cursor_date + v_schedule.start_time) AT TIME ZONE v_coach_tz;
            v_end_ts := (v_cursor_date + v_schedule.end_time) AT TIME ZONE v_coach_tz;

            INSERT INTO public.com_t_session (
                schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
            ) VALUES (
                v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
                v_start_ts, v_end_ts, 1
            )
            ON CONFLICT (schedule_id, start_datetime) DO NOTHING;

            IF FOUND THEN
                v_generated_count := v_generated_count + 1;
            END IF;
        END IF;

        v_cursor_date := v_cursor_date + 7;
    END LOOP;

    RETURN v_generated_count;
END;
$$;

-- 内部処理専用（approve_matching_request経由以外での直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_generate_sessions_for_schedule(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_schedule_shortfall(p_schedule_id uuid)
RETURNS TABLE(expected_sessions integer, actual_sessions integer, shortfall integer)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_expected integer;
    v_actual integer;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    v_expected := v_schedule.target_sessions;

    SELECT COUNT(*) INTO v_actual
    FROM public.com_t_session s
    WHERE s.schedule_id = p_schedule_id
      AND (
        s.status IN (1, 2, 6, 7)
        OR (s.status IN (3, 4, 10) AND s.ticket_refunded = false)
      );

    RETURN QUERY SELECT v_expected, v_actual, GREATEST(v_expected - v_actual, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schedule_shortfall(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_schedule_shortfall(uuid) TO authenticated;


---------------------------------------------
-- 25. ON CONFLICT対象と一意インデックスの不一致修正 (2026-09-14 追加)
---------------------------------------------
-- 【背景】
-- 2026-09-12の「Wブッキング防止の一意制約を有効な予約枠のみに限定」パッチで
-- uq_session_schedule_datetimeを「WHERE status = 1」の部分一意インデックスに変更した際、
-- fn_generate_sessions_for_schedule()のON CONFLICT (schedule_id, start_datetime)にも
-- 同じWHERE句を追記する必要があったが漏れていた。部分一意インデックスをON CONFLICTの
-- 推論対象にするには、INSERT側のON CONFLICT節にも同一のWHERE句を明示する必要があり
-- (Postgresの仕様)、一致しない場合は実際の重複有無に関わらず常にエラー(42P10: no unique
-- or exclusion constraint matching the ON CONFLICT specification)になる。これにより
-- 2026-09-12以降、本関数を経由するセッション生成(マッチング承認・アドミン直接マッチング
-- いずれも)が全件失敗する状態になっていた。本リリースのデータ主体テスト中に発見。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_sessions_for_schedule(p_schedule_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_coach_tz text;
    v_cursor_date date;
    v_start_ts timestamptz;
    v_end_ts timestamptz;
    v_generated_count integer := 0;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    v_coach_tz := v_schedule.coach_timezone;

    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date AND v_generated_count < v_schedule.target_sessions LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.com_t_coach_availability_exception e
            WHERE e.coach_id = v_schedule.coach_id
              AND e.exception_date = v_cursor_date
              AND e.exception_type = 'BLOCK'
              AND e.start_time < v_schedule.end_time
              AND e.end_time > v_schedule.start_time
        ) THEN
            v_start_ts := (v_cursor_date + v_schedule.start_time) AT TIME ZONE v_coach_tz;
            v_end_ts := (v_cursor_date + v_schedule.end_time) AT TIME ZONE v_coach_tz;

            INSERT INTO public.com_t_session (
                schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
            ) VALUES (
                v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
                v_start_ts, v_end_ts, 1
            )
            ON CONFLICT (schedule_id, start_datetime) WHERE status = 1 DO NOTHING;

            IF FOUND THEN
                v_generated_count := v_generated_count + 1;
            END IF;
        END IF;

        v_cursor_date := v_cursor_date + 7;
    END LOOP;

    RETURN v_generated_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_generate_sessions_for_schedule(uuid) FROM PUBLIC, anon, authenticated;


---------------------------------------------
-- 26. 個別予約・振替候補・マッチング承認への24時間ルール適用 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- 仕様上「生徒の個別セッション予約は開始24時間以内は不可（翌日以降のみ可能）」
-- というルールがあるが、データ主体テスト前のレビューで、これがRPC側で強制されて
-- おらず、生徒アプリ側の「24時間」表示も参考表示のみ（UIでの入力制限・サーバー側
-- 検証のいずれも無し）であることが判明した。マッチング申請の成立（初回セッション）・
-- キャンセル時の振替候補についても同じ「開始24時間以上先」ルールの対象であるべきとの
-- 確認が取れたため、以下の3系統・6関数にまとめて適用する。アドミン代理操作
-- （admin_book_session_direct/admin_reschedule_session/admin_match_student_with_coach）は
-- 従来通り対象外（未来であればいつでも予約・変更可能）。
--
--   1. 生徒の個別予約リクエスト: create_session_booking_request()の作成時のみ検証する。
--      承認するapprove_session_booking_request()では意図的に再検証しない（承認までに
--      猶予が24時間を切っても構わない。再検証すると、コーチが即応答しない限り承認
--      できなくなるという不合理なルールになってしまうため。24時間ルールは「申請した
--      時点で妥当な時間を指定したか」を検証するものであり、相手の応答速度を制約する
--      ものではない、という整理とする）。
--   2. キャンセル時の振替候補提案: cancel_session()の提案作成時のみ検証する。
--      承諾するaccept_session_reschedule_proposal()でも同様の理由で意図的に
--      再検証しない（提案の有効期限は最大24時間のため、その間に猶予が24時間を切って
--      承諾されることはあり得るが、1と同じ整理により許容する）。
--   3. マッチング申請の承認: 曜日パターンから初回セッションを自動生成する
--      fn_generate_sessions_for_schedule()に生成範囲の下限(p_min_start_datetime)を
--      追加。下限を下回る回はBLOCK例外と同様に欠番としてスキップする
--      （end_date到達時点での不足はfn_schedule_shortfall()のshortfallとして可視化する
--      のみ、という既存方針をそのまま踏襲）。呼び出し元のapprove_matching_request()が
--      コーチ本人による承認時のみ下限(NOW()+24時間)を渡す。admin_match_student_with_coach()
--      は従来通り下限を渡さない（挙動は変更していないため、本SQLでは
--      fn_generate_sessions_for_schedule()の呼び出し1行のみが実質的な変更対象）。
--
-- シグネチャが変わるfn_generate_sessions_for_schedule()のみ、先にDROP FUNCTIONで
-- 旧シグネチャを明示的に削除する。他5関数は引数を変更していないためCREATE OR REPLACEのみ。
---------------------------------------------

DROP FUNCTION IF EXISTS public.fn_generate_sessions_for_schedule(uuid);

CREATE OR REPLACE FUNCTION public.fn_generate_sessions_for_schedule(
    p_schedule_id uuid,
    p_min_start_datetime timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_coach_tz text;
    v_cursor_date date;
    v_start_ts timestamptz;
    v_end_ts timestamptz;
    v_generated_count integer := 0;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    v_coach_tz := v_schedule.coach_timezone;

    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date AND v_generated_count < v_schedule.target_sessions LOOP
        v_start_ts := (v_cursor_date + v_schedule.start_time) AT TIME ZONE v_coach_tz;
        v_end_ts := (v_cursor_date + v_schedule.end_time) AT TIME ZONE v_coach_tz;

        IF p_min_start_datetime IS NOT NULL AND v_start_ts < p_min_start_datetime THEN
            v_cursor_date := v_cursor_date + 7;
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.com_t_coach_availability_exception e
            WHERE e.coach_id = v_schedule.coach_id
              AND e.exception_date = v_cursor_date
              AND e.exception_type = 'BLOCK'
              AND e.start_time < v_schedule.end_time
              AND e.end_time > v_schedule.start_time
        ) THEN
            INSERT INTO public.com_t_session (
                schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
            ) VALUES (
                v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
                v_start_ts, v_end_ts, 1
            )
            ON CONFLICT (schedule_id, start_datetime) WHERE status = 1 DO NOTHING;

            IF FOUND THEN
                v_generated_count := v_generated_count + 1;
            END IF;
        END IF;

        v_cursor_date := v_cursor_date + 7;
    END LOOP;

    RETURN v_generated_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_generate_sessions_for_schedule(uuid, timestamptz) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.approve_matching_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_coach_timezone text;
    v_schedule_id uuid;
    v_coach_name text;
    v_ticket_total_sessions smallint;
    v_ticket_weekly_frequency smallint;
    v_target_sessions smallint;
    v_min_start_datetime timestamptz;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    IF v_request.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to approve this request';
    END IF;

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    SELECT l.start_date::date, l.end_date::date, t.total_sessions, t.weekly_frequency
    INTO v_license_start, v_license_end, v_ticket_total_sessions, v_ticket_weekly_frequency
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = v_request.ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', v_request.ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    v_target_sessions := (v_ticket_total_sessions / v_ticket_weekly_frequency)
        + CASE WHEN v_request.slot_no <= (v_ticket_total_sessions % v_ticket_weekly_frequency) THEN 1 ELSE 0 END;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_request.coach_id::text || ':' || v_request.requested_day_of_week::text, 0));

    IF public.check_coach_schedule_conflict(
        v_request.coach_id, v_request.requested_day_of_week,
        v_request.requested_start_time, v_request.requested_end_time,
        v_start_date, v_license_end
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_CONFLICT: coach % already has an overlapping active schedule', v_request.coach_id;
    END IF;

    SELECT timezone INTO v_coach_timezone FROM public.com_m_user WHERE id = v_request.coach_id;
    v_coach_timezone := COALESCE(v_coach_timezone, 'Asia/Tokyo');

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        coach_timezone, status, start_date, end_date, source_request_id, target_sessions
    ) VALUES (
        v_request.ticket_id, v_request.student_id, v_request.coach_id, v_request.slot_no,
        v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, v_request.request_id, v_target_sessions
    )
    RETURNING schedule_id INTO v_schedule_id;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    IF public.get_jwt_user_type() = '0' THEN
        v_min_start_datetime := NULL;
    ELSE
        v_min_start_datetime := NOW() + interval '24 hours';
    END IF;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id, v_min_start_datetime);

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (
        v_request.student_id,
        'MATCHING_APPROVED',
        jsonb_build_object('coach_name', v_coach_name, 'schedule_id', v_schedule_id),
        '/live-room'
    );

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;


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
    IF p_start_datetime < NOW() + interval '24 hours' THEN
        RAISE EXCEPTION 'requested start datetime must be at least 24 hours from now';
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
    v_cancel_category smallint;
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
        v_cancel_category := 3; -- admin
        v_refunded := p_admin_refund_ticket;
    ELSIF v_session.student_id = auth.uid() THEN
        v_cancel_category := 1; -- student
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_cancel_category := 2; -- coach
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = 3, cancel_category = v_cancel_category, cancel_reason = p_reason, cancelled_by = auth.uid(),
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

            IF v_slot_start < NOW() + interval '24 hours' THEN
                RAISE EXCEPTION 'proposed time must be at least 24 hours from now';
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
-- 27. 権限チェック・通知INSERTの共通ヘルパー化 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- ライブセッション関連のRPC群で、以下2種類のパターンが多数のファイルにコピー&ペースト
-- されていた。
--   1. 「呼び出し者が対象レコードの当事者本人でなければ、アドミンでない限り拒否する」
--      という権限チェック（約20箇所）
--   2. com_t_notificationへのINSERT（約15箇所）
-- 3つの共通ヘルパー関数（fn_assert_actor_or_admin/fn_assert_dual_actor_or_admin/
-- fn_notify）に集約し、以下18関数を薄いラッパーとして書き換える。挙動は変更しない
-- （create_session_booking_request()/finalize_session()は、アドミンの代理実行を
-- 意図的に許可しないため、今回のヘルパー化の対象外とする。詳細は各ヘルパー・
-- 各関数ファイル自身のコメント参照）。
--
--   対象: reject_matching_request, admin_match_student_with_coach,
--         create_session_booking_request(通知のみ), approve_session_booking_request,
--         reject_session_booking_request, withdraw_session_booking_request,
--         cancel_session, accept_session_reschedule_proposal,
--         decline_session_reschedule_proposals, admin_book_session_direct,
--         admin_reschedule_session, resolve_stale_session,
--         release_lesson_schedule_slot, invalidate_user_license,
--         check_session_conflict, get_coach_monthly_sessions,
--         get_coach_monthly_active_students, approve_matching_request
---------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_assert_actor_or_admin(
    p_actor_id uuid,
    p_message text DEFAULT 'not authorized'
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS DISTINCT FROM p_actor_id AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION '%', p_message;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_assert_actor_or_admin(uuid, text) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.fn_assert_dual_actor_or_admin(
    p_actor_id_1 uuid,
    p_actor_id_2 uuid,
    p_message text DEFAULT 'not authorized'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_is_neither_actor boolean;
BEGIN
    v_is_neither_actor := (auth.uid() IS DISTINCT FROM p_actor_id_1 AND auth.uid() IS DISTINCT FROM p_actor_id_2);
    IF v_is_neither_actor AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION '%', p_message;
    END IF;
    RETURN v_is_neither_actor;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_assert_dual_actor_or_admin(uuid, uuid, text) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.fn_notify(
    p_user_id uuid,
    p_notification_type text,
    p_payload jsonb,
    p_link_path text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES (p_user_id, p_notification_type, p_payload, p_link_path);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_notify(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.reject_matching_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_coach_name text;
BEGIN
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'reject_reason is required';
    END IF;

    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to reject this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 3, reject_reason = p_reason, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_REJECTED',
        jsonb_build_object('coach_name', v_coach_name),
        '/coach-matching'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_matching_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_matching_request(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.approve_matching_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_coach_timezone text;
    v_schedule_id uuid;
    v_coach_name text;
    v_ticket_total_sessions smallint;
    v_ticket_weekly_frequency smallint;
    v_target_sessions smallint;
    v_min_start_datetime timestamptz;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to approve this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    SELECT l.start_date::date, l.end_date::date, t.total_sessions, t.weekly_frequency
    INTO v_license_start, v_license_end, v_ticket_total_sessions, v_ticket_weekly_frequency
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = v_request.ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', v_request.ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    v_target_sessions := (v_ticket_total_sessions / v_ticket_weekly_frequency)
        + CASE WHEN v_request.slot_no <= (v_ticket_total_sessions % v_ticket_weekly_frequency) THEN 1 ELSE 0 END;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_request.coach_id::text || ':' || v_request.requested_day_of_week::text, 0));

    IF public.check_coach_schedule_conflict(
        v_request.coach_id, v_request.requested_day_of_week,
        v_request.requested_start_time, v_request.requested_end_time,
        v_start_date, v_license_end
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_CONFLICT: coach % already has an overlapping active schedule', v_request.coach_id;
    END IF;

    SELECT timezone INTO v_coach_timezone FROM public.com_m_user WHERE id = v_request.coach_id;
    v_coach_timezone := COALESCE(v_coach_timezone, 'Asia/Tokyo');

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        coach_timezone, status, start_date, end_date, source_request_id, target_sessions
    ) VALUES (
        v_request.ticket_id, v_request.student_id, v_request.coach_id, v_request.slot_no,
        v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, v_request.request_id, v_target_sessions
    )
    RETURNING schedule_id INTO v_schedule_id;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    IF public.get_jwt_user_type() = '0' THEN
        v_min_start_datetime := NULL;
    ELSE
        v_min_start_datetime := NOW() + interval '24 hours';
    END IF;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id, v_min_start_datetime);

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_APPROVED',
        jsonb_build_object('coach_name', v_coach_name, 'schedule_id', v_schedule_id),
        '/live-room'
    );

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;


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
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_coach_timezone text;
    v_schedule_id uuid;
    v_request_id uuid;
    v_coach_name text;
    v_student_name text;
    v_ticket_total_sessions smallint;
    v_ticket_weekly_frequency smallint;
    v_target_sessions smallint;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to perform admin matching');

    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    SELECT l.start_date::date, l.end_date::date, t.total_sessions, t.weekly_frequency
    INTO v_license_start, v_license_end, v_ticket_total_sessions, v_ticket_weekly_frequency
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    v_target_sessions := (v_ticket_total_sessions / v_ticket_weekly_frequency)
        + CASE WHEN p_slot_no <= (v_ticket_total_sessions % v_ticket_weekly_frequency) THEN 1 ELSE 0 END;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_coach_id::text || ':' || p_day_of_week::text, 0));

    IF public.check_coach_schedule_conflict(
        p_coach_id, p_day_of_week, p_start_time, p_end_time, v_start_date, v_license_end
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_CONFLICT: coach % already has an overlapping active schedule', p_coach_id;
    END IF;

    SELECT timezone INTO v_coach_timezone FROM public.com_m_user WHERE id = p_coach_id;
    v_coach_timezone := COALESCE(v_coach_timezone, 'Asia/Tokyo');

    INSERT INTO public.com_t_matching_request (
        ticket_id, student_id, coach_id, slot_no, requested_day_of_week, requested_start_time, requested_end_time,
        status, responded_by, responded_at
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        2, auth.uid(), NOW()
    )
    RETURNING request_id INTO v_request_id;

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        coach_timezone, status, start_date, end_date, source_request_id, target_sessions
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, v_request_id, v_target_sessions
    )
    RETURNING schedule_id INTO v_schedule_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id);

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = p_coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_student_id;

    PERFORM public.fn_notify(v_student_id, 'MATCHING_APPROVED', jsonb_build_object('coach_name', v_coach_name, 'schedule_id', v_schedule_id), '/live-room');
    PERFORM public.fn_notify(p_coach_id, 'MATCHING_ASSIGNED_TO_COACH', jsonb_build_object('student_name', v_student_name, 'schedule_id', v_schedule_id), '/students/' || v_student_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) TO authenticated;


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
    v_student_name text;
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
    IF p_start_datetime < NOW() + interval '24 hours' THEN
        RAISE EXCEPTION 'requested start datetime must be at least 24 hours from now';
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

    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_schedule.student_id;
    PERFORM public.fn_notify(
        v_schedule.coach_id,
        'SESSION_BOOKING_REQUESTED',
        jsonb_build_object(
            'request_id', v_request_id,
            'student_name', v_student_name,
            'requested_start_datetime', p_start_datetime
        ),
        '/students/' || v_schedule.student_id
    );

    RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) TO authenticated;


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
    v_coach_name text;
BEGIN
    SELECT * INTO v_request FROM public.com_t_session_booking_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to respond to this booking request');

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

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'SESSION_BOOKING_APPROVED',
        jsonb_build_object(
            'request_id', p_request_id,
            'session_id', v_new_session_id,
            'coach_name', v_coach_name,
            'session_start_datetime', v_request.requested_start_datetime
        ),
        '/live-room'
    );

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
    v_coach_name text;
BEGIN
    SELECT * INTO v_request FROM public.com_t_session_booking_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to respond to this booking request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'this booking request is no longer pending (status=%)', v_request.status;
    END IF;

    UPDATE public.com_t_session_booking_request
    SET status = 3, reject_reason = NULLIF(BTRIM(p_reason), ''), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'SESSION_BOOKING_REJECTED',
        jsonb_build_object(
            'request_id', p_request_id,
            'coach_name', v_coach_name,
            'reject_reason', p_reason,
            'requested_start_datetime', v_request.requested_start_datetime
        ),
        '/live-room'
    );
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

    PERFORM public.fn_assert_actor_or_admin(v_request.student_id, 'not authorized to withdraw this booking request');

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
    v_cancel_category smallint;
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

    v_is_admin_proxy := public.fn_assert_dual_actor_or_admin(v_session.student_id, v_session.coach_id, 'not authorized to cancel this session');

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
        v_cancel_category := 3; -- admin
        v_refunded := p_admin_refund_ticket;
    ELSIF v_session.student_id = auth.uid() THEN
        v_cancel_category := 1; -- student
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_cancel_category := 2; -- coach
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = 3, cancel_category = v_cancel_category, cancel_reason = p_reason, cancelled_by = auth.uid(),
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

            IF v_slot_start < NOW() + interval '24 hours' THEN
                RAISE EXCEPTION 'proposed time must be at least 24 hours from now';
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
        PERFORM public.fn_notify(v_session.student_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/live-room');
        PERFORM public.fn_notify(v_session.coach_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/students/' || v_session.student_id);
    ELSIF v_is_coach THEN
        PERFORM public.fn_notify(
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
        PERFORM public.fn_notify(
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
    v_counterpart_name text;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_reschedule_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    v_responder_id := CASE WHEN v_proposal.proposed_by_role = 2 THEN v_proposal.student_id ELSE v_proposal.coach_id END;
    PERFORM public.fn_assert_actor_or_admin(v_responder_id, 'not authorized to respond to this proposal');

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

    -- 同じキャンセルに紐づく他の候補（まだpendingのもの）は自動的に不採用にする
    UPDATE public.com_t_session_reschedule_proposal
    SET status = 3, responded_at = NOW(), update_date = NOW()
    WHERE session_id = v_proposal.session_id
      AND proposal_id <> p_proposal_id
      AND status = 1;

    -- 承諾したのが生徒ならコーチへ、コーチならば生徒へ通知する
    IF v_responder_id = v_session.student_id THEN
        SELECT user_name INTO v_counterpart_name FROM public.com_m_user WHERE id = v_session.student_id;
        PERFORM public.fn_notify(
            v_session.coach_id,
            'SESSION_BOOKED_BY_STUDENT',
            jsonb_build_object(
                'session_id', v_new_session_id,
                'student_name', v_counterpart_name,
                'session_start_datetime', v_proposal.proposed_start_datetime
            ),
            '/students/' || v_session.student_id
        );
    ELSE
        SELECT user_name INTO v_counterpart_name FROM public.com_m_user WHERE id = v_session.coach_id;
        PERFORM public.fn_notify(
            v_session.student_id,
            'SESSION_BOOKING_APPROVED',
            jsonb_build_object(
                'session_id', v_new_session_id,
                'coach_name', v_counterpart_name,
                'session_start_datetime', v_proposal.proposed_start_datetime
            ),
            '/live-room'
        );
    END IF;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_session_reschedule_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_session_reschedule_proposal(uuid) TO authenticated;


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
    PERFORM public.fn_assert_actor_or_admin(v_responder_id, 'not authorized to respond to this proposal');

    UPDATE public.com_t_session_reschedule_proposal
    SET status = 3, responded_at = NOW(), update_date = NOW()
    WHERE session_id = p_session_id AND status = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_session_reschedule_proposals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_session_reschedule_proposals(uuid) TO authenticated;


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
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to book a session for this schedule');

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

    PERFORM public.fn_notify(v_schedule.student_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', v_new_session_id, 'session_start_datetime', p_start_datetime), '/live-room');
    PERFORM public.fn_notify(v_schedule.coach_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', v_new_session_id, 'session_start_datetime', p_start_datetime), '/students/' || v_schedule.student_id);

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_book_session_direct(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_book_session_direct(uuid, timestamptz, timestamptz, text) TO authenticated;


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
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to reschedule this session');

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
    SET status = 3, cancel_category = 3, cancel_reason = p_reason, cancelled_by = auth.uid(), update_date = NOW()
    WHERE session_id = p_session_id;

    PERFORM public.fn_notify(v_session.student_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'new_session_id', v_new_session_id, 'session_start_datetime', p_new_start_datetime), '/live-room');
    PERFORM public.fn_notify(v_session.coach_id, 'SESSION_UPDATED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'new_session_id', v_new_session_id, 'session_start_datetime', p_new_start_datetime), '/students/' || v_session.student_id);

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reschedule_session(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reschedule_session(uuid, timestamptz, timestamptz, text) TO authenticated;


DROP FUNCTION IF EXISTS public.resolve_stale_session(uuid, smallint, text);

CREATE OR REPLACE FUNCTION public.resolve_stale_session(p_session_id uuid, p_completion_result smallint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_ticket RECORD;
BEGIN
    IF p_completion_result NOT IN (1, 2, 3) THEN
        RAISE EXCEPTION 'invalid completion result %', p_completion_result;
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason required to resolve a stale session';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_session.coach_id, 'not authorized to resolve this session');

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.end_datetime > NOW() THEN
        RAISE EXCEPTION 'cannot resolve a session before its end time';
    END IF;

    UPDATE public.com_t_session
    SET status = 2, completion_result = p_completion_result, status_note = p_reason, update_date = NOW()
    WHERE session_id = p_session_id;

    IF p_completion_result = 1 THEN
        UPDATE public.com_t_user_session_ticket
        SET used_sessions = used_sessions + 1, update_date = NOW()
        WHERE ticket_id = v_session.ticket_id
        RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

        IF FOUND THEN
            INSERT INTO public.com_t_user_session_ticket_history
                (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
            VALUES
                (v_session.ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, p_reason, auth.uid());
        END IF;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.release_lesson_schedule_slot(p_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to release a lesson schedule slot');

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    -- 1. スケジュールを終了させる
    UPDATE public.com_m_lesson_schedule
    SET status = 9, update_date = NOW()
    WHERE schedule_id = p_schedule_id;

    -- 2. 紐づく承認済みリクエストを終了させ、同じ枠への再リクエストを可能にする
    IF v_schedule.source_request_id IS NOT NULL THEN
        UPDATE public.com_t_matching_request
        SET status = 5, update_date = NOW()
        WHERE request_id = v_schedule.source_request_id AND status = 2;
    END IF;

    -- 3. まだ実施されていない未来のセッションのみキャンセルする（過去の記録は変更しない）
    UPDATE public.com_t_session
    SET status = 3,
        cancel_category = 5, -- coach_reassigned
        cancel_reason = 'コーチ交代のため',
        cancelled_by = auth.uid(),
        update_date = NOW()
    WHERE schedule_id = p_schedule_id AND status = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.invalidate_user_license(p_license_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_license RECORD;
    v_ticket_id uuid;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to invalidate a license');

    SELECT * INTO v_license FROM public.com_t_user_license WHERE license_id = p_license_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'license % not found', p_license_id;
    END IF;

    IF v_license.status <> 1 THEN
        RAISE EXCEPTION 'license % is not active (status=%)', p_license_id, v_license.status;
    END IF;

    -- 1. ライセンス自体を無効化する
    UPDATE public.com_t_user_license
    SET status = 0, update_date = NOW()
    WHERE license_id = p_license_id;

    -- Blueprintのみライセンス（コーチ無し）はチケット自体が存在しないため、
    -- 以降のスケジュール終了・セッションキャンセルは対象0件のまま何も起きない
    SELECT ticket_id INTO v_ticket_id
    FROM public.com_t_user_session_ticket
    WHERE license_id = p_license_id;

    IF v_ticket_id IS NOT NULL THEN
        -- 2. 紐づく稼働中のスケジュールを終了させる
        UPDATE public.com_m_lesson_schedule
        SET status = 9, update_date = NOW()
        WHERE ticket_id = v_ticket_id AND status = 1;

        -- 3. まだ実施されていない未来のセッションのみキャンセルする（過去の記録は変更しない）
        UPDATE public.com_t_session
        SET status = 3,
            cancel_category = 4, -- license_ended
            cancel_reason = 'ライセンス無効化のため',
            cancelled_by = auth.uid(),
            update_date = NOW()
        WHERE ticket_id = v_ticket_id AND status = 1; -- scheduledのみ対象
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invalidate_user_license(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invalidate_user_license(uuid) TO authenticated;


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
    PERFORM public.fn_assert_dual_actor_or_admin(p_coach_id, p_student_id, 'not authorized to check this schedule');

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


DROP FUNCTION IF EXISTS public.get_coach_monthly_sessions(uuid, date);

CREATE OR REPLACE FUNCTION public.get_coach_monthly_sessions(p_coach_id uuid, p_report_month date)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    completion_result smallint,
    cancel_category smallint,
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
    PERFORM public.fn_assert_actor_or_admin(p_coach_id, 'not authorized to view this coach''s monthly report');

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo'; -- 対象コーチが存在しない場合のフォールバック（結果は0件になる）
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
        s.completion_result,
        s.cancel_category,
        s.status_note,
        s.ticket_refunded,
        (s.status = 2 OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) AS counts_toward_total,
        (s.status = 1 AND s.end_datetime < NOW()) AS is_unresolved,
        ((s.status = 2 AND s.completion_result IN (2, 3)) OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) AS is_attention
    FROM public.com_t_session s
    WHERE s.coach_id = p_coach_id
      AND s.start_datetime >= v_month_start_utc
      AND s.start_datetime < v_month_end_utc
      AND (
          (s.status = 2 OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) -- counts_toward_total
          OR (s.status = 1 AND s.end_datetime < NOW()) -- is_unresolved
      )
    ORDER BY s.student_id, s.start_datetime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) TO authenticated;


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
    PERFORM public.fn_assert_actor_or_admin(p_coach_id, 'not authorized to view this coach''s monthly report');

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo'; -- 対象コーチが存在しない場合のフォールバック（結果は0件になる）
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


---------------------------------------------
-- 28. マッチング成立処理・一括キャンセル処理・チケット消費処理の共通化 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- 以下3ペアの関数が、それぞれ大部分が重複したロジックを個別に持っていた。
--   1. approve_matching_request() / admin_match_student_with_coach()
--      target_sessions算出〜アドバイザリロック〜空き状況チェック〜
--      com_m_lesson_schedule作成〜com_t_session一括生成がほぼ丸ごと重複
--      → fn_commit_matching_schedule()に集約
--   2. release_lesson_schedule_slot() / invalidate_user_license()
--      「未実施の未来のscheduledセッションのみをキャンセルする」UPDATE文が同一
--      → fn_cancel_future_sessions()に集約
--   3. finalize_session() / resolve_stale_session()
--      「used_sessions加算＋com_t_user_session_ticket_historyへの履歴記録」のペアが同一
--      → fn_consume_session_ticket()に集約
-- いずれも挙動は変更しない（内部実装の重複排除のみ）。詳細な設計判断は各ヘルパー・
-- 各呼び出し元ファイル自身のコメントを参照。
---------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_commit_matching_schedule(
    p_request_id uuid,
    p_ticket_id uuid,
    p_student_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_min_start_datetime timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_coach_timezone text;
    v_schedule_id uuid;
    v_ticket_total_sessions smallint;
    v_ticket_weekly_frequency smallint;
    v_target_sessions smallint;
BEGIN
    SELECT l.start_date::date, l.end_date::date, t.total_sessions, t.weekly_frequency
    INTO v_license_start, v_license_end, v_ticket_total_sessions, v_ticket_weekly_frequency
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    v_target_sessions := (v_ticket_total_sessions / v_ticket_weekly_frequency)
        + CASE WHEN p_slot_no <= (v_ticket_total_sessions % v_ticket_weekly_frequency) THEN 1 ELSE 0 END;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_coach_id::text || ':' || p_day_of_week::text, 0));

    IF public.check_coach_schedule_conflict(
        p_coach_id, p_day_of_week, p_start_time, p_end_time, v_start_date, v_license_end
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_CONFLICT: coach % already has an overlapping active schedule', p_coach_id;
    END IF;

    SELECT timezone INTO v_coach_timezone FROM public.com_m_user WHERE id = p_coach_id;
    v_coach_timezone := COALESCE(v_coach_timezone, 'Asia/Tokyo');

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        coach_timezone, status, start_date, end_date, source_request_id, target_sessions
    ) VALUES (
        p_ticket_id, p_student_id, p_coach_id, p_slot_no,
        p_day_of_week, p_start_time, p_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, p_request_id, v_target_sessions
    )
    RETURNING schedule_id INTO v_schedule_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id, p_min_start_datetime);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_commit_matching_schedule(uuid, uuid, uuid, uuid, smallint, smallint, time, time, timestamptz) FROM PUBLIC, anon, authenticated;


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
    WHERE status = 1
      AND (
        (p_schedule_id IS NOT NULL AND schedule_id = p_schedule_id)
        OR (p_ticket_id IS NOT NULL AND ticket_id = p_ticket_id)
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cancel_future_sessions(uuid, uuid, smallint, text) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.fn_consume_session_ticket(
    p_ticket_id uuid,
    p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket RECORD;
BEGIN
    UPDATE public.com_t_user_session_ticket
    SET used_sessions = used_sessions + 1, update_date = NOW()
    WHERE ticket_id = p_ticket_id
    RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

    IF FOUND THEN
        INSERT INTO public.com_t_user_session_ticket_history
            (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
        VALUES
            (p_ticket_id, v_ticket.contract_id, v_ticket.user_id, 'consumed', -1, v_ticket.used_sessions, v_ticket.total_sessions, p_note, auth.uid());
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_consume_session_ticket(uuid, text) FROM PUBLIC, anon, authenticated;


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
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to approve this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    IF public.get_jwt_user_type() = '0' THEN
        v_min_start_datetime := NULL;
    ELSE
        v_min_start_datetime := NOW() + interval '24 hours';
    END IF;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request.request_id, v_request.ticket_id, v_request.student_id, v_request.coach_id,
        v_request.slot_no, v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_min_start_datetime
    );

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_APPROVED',
        jsonb_build_object('coach_name', v_coach_name, 'schedule_id', v_schedule_id),
        '/live-room'
    );

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;


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


CREATE OR REPLACE FUNCTION public.release_lesson_schedule_slot(p_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to release a lesson schedule slot');

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    UPDATE public.com_m_lesson_schedule
    SET status = 9, update_date = NOW()
    WHERE schedule_id = p_schedule_id;

    IF v_schedule.source_request_id IS NOT NULL THEN
        UPDATE public.com_t_matching_request
        SET status = 5, update_date = NOW()
        WHERE request_id = v_schedule.source_request_id AND status = 2;
    END IF;

    PERFORM public.fn_cancel_future_sessions(p_schedule_id, NULL, 5, 'コーチ交代のため'); -- 5=coach_reassigned
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.invalidate_user_license(p_license_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_license RECORD;
    v_ticket_id uuid;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to invalidate a license');

    SELECT * INTO v_license FROM public.com_t_user_license WHERE license_id = p_license_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'license % not found', p_license_id;
    END IF;

    IF v_license.status <> 1 THEN
        RAISE EXCEPTION 'license % is not active (status=%)', p_license_id, v_license.status;
    END IF;

    UPDATE public.com_t_user_license
    SET status = 0, update_date = NOW()
    WHERE license_id = p_license_id;

    SELECT ticket_id INTO v_ticket_id
    FROM public.com_t_user_session_ticket
    WHERE license_id = p_license_id;

    IF v_ticket_id IS NOT NULL THEN
        UPDATE public.com_m_lesson_schedule
        SET status = 9, update_date = NOW()
        WHERE ticket_id = v_ticket_id AND status = 1;

        PERFORM public.fn_cancel_future_sessions(NULL, v_ticket_id, 4, 'ライセンス無効化のため'); -- 4=license_ended
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invalidate_user_license(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invalidate_user_license(uuid) TO authenticated;


DROP FUNCTION IF EXISTS public.finalize_session(uuid, text);

CREATE OR REPLACE FUNCTION public.finalize_session(p_session_id uuid, p_early_end_reason text DEFAULT NULL)
RETURNS TABLE(new_status smallint, completion_result smallint, overlap_seconds integer, student_joined boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_overlap_seconds numeric;
    v_student_joined boolean;
    v_completion_result smallint;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id <> auth.uid() THEN
        RAISE EXCEPTION 'not authorized to finalize this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    SELECT COALESCE(SUM(GREATEST(0,
             EXTRACT(EPOCH FROM (LEAST(c.left_end, s.left_end) - GREATEST(c.joined_at, s.joined_at)))
           )), 0)
      INTO v_overlap_seconds
      FROM (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
              FROM public.com_t_session_call_log
              WHERE session_id = p_session_id AND role = 'coach') c
      CROSS JOIN (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
                    FROM public.com_t_session_call_log
                    WHERE session_id = p_session_id AND role = 'student') s;

    SELECT EXISTS(
      SELECT 1 FROM public.com_t_session_call_log WHERE session_id = p_session_id AND role = 'student'
    ) INTO v_student_joined;

    IF v_overlap_seconds >= 1200 THEN -- 20分
        v_completion_result := 1; -- normal
    ELSIF v_student_joined THEN
        IF p_early_end_reason IS NULL OR btrim(p_early_end_reason) = '' THEN
            RAISE EXCEPTION 'reason required for early-ended session';
        END IF;
        v_completion_result := 2; -- early_ended
    ELSE
        v_completion_result := 3; -- no_show
    END IF;

    UPDATE public.com_t_session
    SET status = 2, completion_result = v_completion_result,
        status_note = CASE WHEN v_completion_result = 2 THEN p_early_end_reason ELSE NULL END,
        update_date = NOW()
    WHERE session_id = p_session_id;

    IF v_completion_result = 1 THEN
        PERFORM public.fn_consume_session_ticket(v_session.ticket_id);
    END IF;

    RETURN QUERY SELECT 2::smallint, v_completion_result, v_overlap_seconds::integer, v_student_joined;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_session(uuid, text) TO authenticated;


DROP FUNCTION IF EXISTS public.resolve_stale_session(uuid, smallint, text);

CREATE OR REPLACE FUNCTION public.resolve_stale_session(p_session_id uuid, p_completion_result smallint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
BEGIN
    IF p_completion_result NOT IN (1, 2, 3) THEN
        RAISE EXCEPTION 'invalid completion result %', p_completion_result;
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason required to resolve a stale session';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_session.coach_id, 'not authorized to resolve this session');

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.end_datetime > NOW() THEN
        RAISE EXCEPTION 'cannot resolve a session before its end time';
    END IF;

    UPDATE public.com_t_session
    SET status = 2, completion_result = p_completion_result, status_note = p_reason, update_date = NOW()
    WHERE session_id = p_session_id;

    IF p_completion_result = 1 THEN
        PERFORM public.fn_consume_session_ticket(v_session.ticket_id, p_reason);
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) TO authenticated;


---------------------------------------------
-- 29. cancel_session: admin-proxy判定の明示化 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- 従来はv_is_admin_proxyを「auth.uid()が生徒ともコーチとも一致しない」という消去法で
-- 推測していた。通常はこれで問題ないが、将来的にアドミンアカウントが同一セッションの
-- 生徒/コーチ本人を兼ねるような想定外のデータ状態が生じた場合、消去法だと誤って
-- 自己申告フロー（12時間ルール等）に流れてしまう。呼び出し元（アドミン代理操作専用の
-- cancelSessionAsAdmin）は元々「今からアドミン代理として呼ぶ」ことを認識しているため、
-- その意図を新パラメータp_as_adminで明示してもらい、本関数側はその申告が実際に
-- アドミンロールを持つ呼び出し者によるものかをfn_assert_actor_or_admin(NULL, ...)で
-- 検証する、という構成に変更する。p_as_admin=falseの場合は、消去法によるアドミン救済を
-- 一切行わず、当事者本人（生徒またはコーチ）であることを厳密に要求する
-- （他の管理者専用RPC群(admin_book_session_direct等)と同じ「呼び出し方自体で意図を示す」
-- 設計思想に揃える）。挙動は変更しない
-- （既存の唯一の呼び出し元cancelSessionAsAdminは、本パッチとあわせてp_as_admin: trueを
-- 明示的に渡すよう更新済み。apps/admin/actions/adminLiveSessionAction.ts参照）。
--
-- シグネチャに引数を追加するため、CREATE OR REPLACEの前にDROP FUNCTIONで旧シグネチャを
-- 明示的に削除する。
---------------------------------------------
DROP FUNCTION IF EXISTS public.cancel_session(uuid, text, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.cancel_session(
    p_session_id uuid,
    p_reason text DEFAULT NULL,
    p_proposed_slots jsonb DEFAULT NULL,
    p_admin_refund_ticket boolean DEFAULT NULL,
    p_as_admin boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_cancel_category smallint;
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

    v_is_admin_proxy := p_as_admin;

    IF v_is_admin_proxy THEN
        -- p_as_admin=trueを名乗った場合、実際にアドミンロールであることを検証する
        -- （当事者本人と一致するかどうかは問わない）
        PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to cancel this session');
    ELSE
        -- p_as_admin=falseの場合は、消去法によるアドミン救済を行わず、当事者本人
        -- （生徒またはコーチ）であることを厳密に要求する
        IF auth.uid() IS DISTINCT FROM v_session.student_id AND auth.uid() IS DISTINCT FROM v_session.coach_id THEN
            RAISE EXCEPTION 'not authorized to cancel this session';
        END IF;
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
        v_cancel_category := 3; -- admin
        v_refunded := p_admin_refund_ticket;
    ELSIF v_session.student_id = auth.uid() THEN
        v_cancel_category := 1; -- student
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_cancel_category := 2; -- coach
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = 3, cancel_category = v_cancel_category, cancel_reason = p_reason, cancelled_by = auth.uid(),
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

            IF v_slot_start < NOW() + interval '24 hours' THEN
                RAISE EXCEPTION 'proposed time must be at least 24 hours from now';
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
        PERFORM public.fn_notify(v_session.student_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/live-room');
        PERFORM public.fn_notify(v_session.coach_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/students/' || v_session.student_id);
    ELSIF v_is_coach THEN
        PERFORM public.fn_notify(
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
        PERFORM public.fn_notify(
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

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean, boolean) TO authenticated;

-- =========================================================================
-- 30. スロット提案の統合 (2026-09-15 追加)
-- =========================================================================
-- 【背景】
-- 「相手の承認/承諾を要する日時を提案する」という同一の概念を、発生タイミングの違い
-- （キャンセル直後のその場提案か、後から自発的に行う自由予約リクエストか）だけで
-- 別テーブル・別RPC群・別UI導線に分けていたcom_t_session_reschedule_proposal
-- （コーチ・生徒どちらからでも提案可、特定のキャンセル済みセッションに紐づく、
-- 24時間で自動失効）とcom_t_session_booking_request（生徒のみ提案可、特定の
-- コマ(schedule_id)に紐づく、無期限）を、com_t_session_slot_proposalへ統合する。
-- 承認/却下RPCもapprove_slot_proposal()/reject_slot_proposal()へ一本化する
-- （旧approve_session_booking_request/reject_session_booking_request/
-- accept_session_reschedule_proposal/decline_session_reschedule_proposalsは削除）。
-- 作成側(create_session_booking_request()/cancel_session())とwithdraw_session_booking_request()は
-- RPC名・シグネチャを変更せず、内部の書き込み/参照先テーブルのみ変更する。
-- 開発中のためデータ移行は行わず、旧テーブルはそのままDROPする（本番未リリース）。
-- withdraw（提案者による取り下げ）は現状どおり自由予約リクエストのみに限定し、
-- 振替候補には適用しない（chk_slot_proposal_withdraw_scope制約で機械的に担保する）。
-- 詳細は table/com_t_session_slot_proposal.sql, function/approve_slot_proposal.sql,
-- function/reject_slot_proposal.sql のコメントを参照。
-- =========================================================================

---------------------------------------------
-- 30-1. com_t_session_slot_proposal テーブルを新規作成する
---------------------------------------------
CREATE TABLE public.com_t_session_slot_proposal (
    proposal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES public.com_m_lesson_schedule(schedule_id) ON DELETE CASCADE,
    source_session_id uuid REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    proposed_start_datetime timestamp with time zone NOT NULL,
    proposed_end_datetime timestamp with time zone NOT NULL,
    proposed_by_role smallint NOT NULL, -- 1:生徒が提案 2:コーチが提案
    status smallint NOT NULL DEFAULT 1, -- 1:pending 2:accepted 3:declined 4:withdrawn 5:expired
    expires_at timestamp with time zone, -- 振替候補のみ設定。自由予約リクエストはNULL(無期限)
    reason text DEFAULT NULL, -- 生徒が自由予約リクエスト作成時に任意で添えるメモ
    reject_reason text DEFAULT NULL, -- 却下時に任意で添える理由
    responded_at timestamp with time zone,
    resulting_session_id uuid REFERENCES public.com_t_session(session_id), -- accepted時に新規作成されたセッション（非CASCADE。テストデータ削除時の順序に注意）
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_slot_proposal_time_range CHECK (proposed_end_datetime > proposed_start_datetime),
    CONSTRAINT chk_slot_proposal_role CHECK (proposed_by_role IN (1, 2)),
    CONSTRAINT chk_slot_proposal_status CHECK (status IN (1, 2, 3, 4, 5)),
    -- 自由予約リクエスト(source_session_id IS NULL)は必ず生徒発信。個別予約は生徒のみ可能という
    -- 仕様（コーチは自由予約リクエストを作成できない）をDB側でも機械的に担保する。
    CONSTRAINT chk_slot_proposal_booking_role CHECK (source_session_id IS NOT NULL OR proposed_by_role = 1),
    -- withdrawn(4)は自由予約リクエストのみが取り得る状態（振替候補は取り下げ不可の仕様。
    -- 提案者が任意に取り下げられるのは自由予約リクエストのみで、キャンセル時の振替候補は
    -- 相手の応答か回答期限切れを待つのみ、という現行仕様を維持する）。
    CONSTRAINT chk_slot_proposal_withdraw_scope CHECK (status <> 4 OR source_session_id IS NULL)
);

COMMENT ON TABLE public.com_t_session_slot_proposal IS 'セッション日時の候補提案（キャンセル時の振替候補・自由予約リクエストを統合）。相手の承認/承諾を要する日時提案という同一概念の唯一の実体';
COMMENT ON COLUMN public.com_t_session_slot_proposal.schedule_id IS '対象の定期スケジュール（コマ。com_m_lesson_schedule）';
COMMENT ON COLUMN public.com_t_session_slot_proposal.source_session_id IS 'キャンセル起因の場合のみ設定される、提案元のキャンセル済みセッション。NULLなら自由予約リクエスト（特定セッションのキャンセルに紐づかない単発の新規予約希望）';
COMMENT ON COLUMN public.com_t_session_slot_proposal.proposed_by_role IS '提案者 1:生徒が提案（コーチが応答） 2:コーチが提案（生徒が応答）。自由予約リクエストは常に1固定';
COMMENT ON COLUMN public.com_t_session_slot_proposal.status IS 'ステータス 1:pending(未回答) 2:accepted(承諾/承認済み) 3:declined(却下、または他候補の承諾により自動不採用) 4:withdrawn(提案者本人による取り下げ。自由予約リクエストのみ) 5:expired(回答期限切れ。振替候補のみ)';
COMMENT ON COLUMN public.com_t_session_slot_proposal.expires_at IS '回答期限。振替候補は提案(cancel_session)実行時に決定した固定値（後から定数を変更しても発行済みの提案には遡って影響しない）。自由予約リクエストはNULL(無期限)';
COMMENT ON COLUMN public.com_t_session_slot_proposal.reason IS '生徒が自由予約リクエスト作成時に任意で添えるメモ（コーチへの一言）。振替候補では未使用';
COMMENT ON COLUMN public.com_t_session_slot_proposal.reject_reason IS '却下時に任意で添える理由（現状は自由予約リクエストの却下でのみ使用）';
COMMENT ON COLUMN public.com_t_session_slot_proposal.resulting_session_id IS '承諾/承認により新規作成されたcom_t_session行（status=2以外はNULL）';

CREATE INDEX idx_slot_proposal_schedule ON public.com_t_session_slot_proposal (schedule_id);
CREATE INDEX idx_slot_proposal_source_session ON public.com_t_session_slot_proposal (source_session_id);
CREATE INDEX idx_slot_proposal_student_status ON public.com_t_session_slot_proposal (student_id, status);
CREATE INDEX idx_slot_proposal_coach_status ON public.com_t_session_slot_proposal (coach_id, status);
-- コーチ側「申請一覧」画面のHistoryタブ(cursor-basedページング)用
CREATE INDEX idx_slot_proposal_coach_insert_date ON public.com_t_session_slot_proposal (coach_id, insert_date DESC);

ALTER TABLE public.com_t_session_slot_proposal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view slot proposals" ON public.com_t_session_slot_proposal;

-- [参照] 対象の生徒本人・対象コーチ本人・管理者のみ閲覧可能。
-- 書き込み(作成・承認・却下・取下げ)はすべてSECURITY DEFINER関数経由のみとし、
-- authenticatedロールへのINSERT/UPDATE権限は一切付与しない。
CREATE POLICY "Involved users can view slot proposals" ON public.com_t_session_slot_proposal
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

---------------------------------------------
-- 30-2. 旧テーブルを削除する（開発中のためデータ移行は行わない）
---------------------------------------------
DROP TABLE IF EXISTS public.com_t_session_reschedule_proposal;
DROP TABLE IF EXISTS public.com_t_session_booking_request;

---------------------------------------------
-- 30-3. approve_slot_proposal() / reject_slot_proposal() を新規作成する
--       (approve_session_booking_request/accept_session_reschedule_proposal、
--        reject_session_booking_request/decline_session_reschedule_proposalsを統合)
---------------------------------------------
-- 【応答者の一般化】
-- 「相手が提案した候補日時を、応答する側が承諾/承認してセッションを確定する」処理は、
-- 振替候補・自由予約リクエストのいずれでも本質的に同一だった（「応答できるのは提案者と
-- 逆側のみ」「対象がpendingであること」「コーチ・生徒それぞれの二重予約チェック」
-- 「com_t_session新規作成」という骨格が完全に一致）。proposed_by_role（1:生徒提案
-- 2:コーチ提案）を使い、応答者を「提案者と逆側」として一般化する。自由予約リクエストは
-- proposed_by_role=1固定（DB制約chk_slot_proposal_booking_roleで保証）のため、この式は
-- 常に「コーチが応答」になり、旧approve_session_booking_requestの挙動と自然に一致する。
--
-- 【有効期限】expires_atが設定されている場合（振替候補）のみ期限切れ判定を行う。
-- 【同一キャンセル起因の他候補の自動不採用】source_session_idが設定されている場合のみ、
--   同じキャンセルに紐づく他のpending候補を自動的に不採用(declined)にする。
-- 【通知】応答した側と逆（＝提案者）へ通知する。生徒が応答した場合はコーチへ
--   SESSION_BOOKED_BY_STUDENT、コーチが応答した場合は生徒へSESSION_BOOKING_APPROVEDを送る。
--
-- 却下(reject_slot_proposal)の粒度は振替候補と自由予約リクエストで異なる（旧仕様を踏襲）。
--   - 振替候補(source_session_id IS NOT NULL): 同一キャンセルに紐づくpendingな候補は
--     「いずれか1つを選ぶ」ための選択肢のため、まとめて却下する。通知は行わない（旧仕様）。
--   - 自由予約リクエスト(source_session_id IS NULL): この1件のみを却下し、理由(p_reason)を
--     記録、生徒へSESSION_BOOKING_REJECTED通知を送る。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_slot_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
    v_schedule RECORD;
    v_responder_id uuid;
    v_new_session_id uuid;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_counterpart_name text;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_slot_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    -- 提案者と逆側（proposed_by_role=2:コーチ提案なら生徒、1:生徒提案ならコーチ）のみ応答できる
    v_responder_id := CASE WHEN v_proposal.proposed_by_role = 2 THEN v_proposal.student_id ELSE v_proposal.coach_id END;
    PERFORM public.fn_assert_actor_or_admin(v_responder_id, 'not authorized to respond to this proposal');

    IF v_proposal.status = 1 AND v_proposal.expires_at IS NOT NULL AND v_proposal.expires_at <= NOW() THEN
        UPDATE public.com_t_session_slot_proposal SET status = 5, update_date = NOW() WHERE proposal_id = p_proposal_id AND status = 1;
        RAISE EXCEPTION 'this proposal has expired';
    END IF;

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = v_proposal.schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', v_proposal.schedule_id;
    END IF;

    -- 提案から応答までに時間が空くことを考慮し、二重予約チェックは改めて必ず行う
    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_proposal.coach_id, v_proposal.student_id, v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime, v_proposal.source_session_id);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_proposal.schedule_id, v_schedule.ticket_id, v_proposal.student_id, v_proposal.coach_id,
        v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime, 1, v_proposal.source_session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session_slot_proposal
    SET status = 2, responded_at = NOW(), resulting_session_id = v_new_session_id, update_date = NOW()
    WHERE proposal_id = p_proposal_id;

    IF v_proposal.source_session_id IS NOT NULL THEN
        UPDATE public.com_t_session_slot_proposal
        SET status = 3, responded_at = NOW(), update_date = NOW()
        WHERE source_session_id = v_proposal.source_session_id
          AND proposal_id <> p_proposal_id
          AND status = 1;
    END IF;

    IF v_responder_id = v_proposal.student_id THEN
        SELECT user_name INTO v_counterpart_name FROM public.com_m_user WHERE id = v_proposal.student_id;
        PERFORM public.fn_notify(
            v_proposal.coach_id,
            'SESSION_BOOKED_BY_STUDENT',
            jsonb_build_object('session_id', v_new_session_id, 'student_name', v_counterpart_name, 'session_start_datetime', v_proposal.proposed_start_datetime),
            '/students/' || v_proposal.student_id
        );
    ELSE
        SELECT user_name INTO v_counterpart_name FROM public.com_m_user WHERE id = v_proposal.coach_id;
        PERFORM public.fn_notify(
            v_proposal.student_id,
            'SESSION_BOOKING_APPROVED',
            jsonb_build_object('session_id', v_new_session_id, 'coach_name', v_counterpart_name, 'session_start_datetime', v_proposal.proposed_start_datetime),
            '/live-room'
        );
    END IF;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_slot_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_slot_proposal(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_slot_proposal(p_proposal_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
    v_responder_id uuid;
    v_coach_name text;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_slot_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    v_responder_id := CASE WHEN v_proposal.proposed_by_role = 2 THEN v_proposal.student_id ELSE v_proposal.coach_id END;
    PERFORM public.fn_assert_actor_or_admin(v_responder_id, 'not authorized to respond to this proposal');

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    IF v_proposal.source_session_id IS NOT NULL THEN
        UPDATE public.com_t_session_slot_proposal
        SET status = 3, responded_at = NOW(), update_date = NOW()
        WHERE source_session_id = v_proposal.source_session_id AND status = 1;
    ELSE
        UPDATE public.com_t_session_slot_proposal
        SET status = 3, reject_reason = p_reason, responded_at = NOW(), update_date = NOW()
        WHERE proposal_id = p_proposal_id;

        SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_proposal.coach_id;
        PERFORM public.fn_notify(
            v_proposal.student_id,
            'SESSION_BOOKING_REJECTED',
            jsonb_build_object('coach_name', v_coach_name, 'reject_reason', p_reason, 'requested_start_datetime', v_proposal.proposed_start_datetime),
            '/live-room'
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_slot_proposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_slot_proposal(uuid, text) TO authenticated;

---------------------------------------------
-- 30-4. 旧RPCを削除する
---------------------------------------------
DROP FUNCTION IF EXISTS public.approve_session_booking_request(uuid);
DROP FUNCTION IF EXISTS public.reject_session_booking_request(uuid, text);
DROP FUNCTION IF EXISTS public.accept_session_reschedule_proposal(uuid);
DROP FUNCTION IF EXISTS public.decline_session_reschedule_proposals(uuid);

---------------------------------------------
-- 30-5. create_session_booking_request() を更新する
--       (書き込み先をcom_t_session_booking_requestからcom_t_session_slot_proposalへ変更。
--        schedule_id必須・source_session_id=NULL・proposed_by_role=1(生徒)固定・
--        expires_at=NULL(無期限)で挿入する。RPC名・シグネチャは変更しない)
---------------------------------------------
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
    v_student_name text;
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
    IF p_start_datetime < NOW() + interval '24 hours' THEN
        RAISE EXCEPTION 'requested start datetime must be at least 24 hours from now';
    END IF;

    SELECT shortfall INTO v_shortfall FROM public.fn_schedule_shortfall(p_schedule_id);

    SELECT COUNT(*) INTO v_pending_count
    FROM public.com_t_session_slot_proposal r
    WHERE r.schedule_id = p_schedule_id AND r.status = 1 AND r.source_session_id IS NULL;

    IF v_shortfall - v_pending_count <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_schedule.coach_id, v_schedule.student_id, p_start_datetime, p_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session_slot_proposal (
        schedule_id, source_session_id, student_id, coach_id, proposed_start_datetime, proposed_end_datetime,
        proposed_by_role, status, expires_at, reason
    ) VALUES (
        p_schedule_id, NULL, v_schedule.student_id, v_schedule.coach_id, p_start_datetime, p_end_datetime,
        1, 1, NULL, NULLIF(BTRIM(p_reason), '')
    )
    RETURNING proposal_id INTO v_request_id;

    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_schedule.student_id;
    PERFORM public.fn_notify(
        v_schedule.coach_id,
        'SESSION_BOOKING_REQUESTED',
        jsonb_build_object(
            'request_id', v_request_id,
            'student_name', v_student_name,
            'requested_start_datetime', p_start_datetime
        ),
        '/students/' || v_schedule.student_id
    );

    RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) TO authenticated;

---------------------------------------------
-- 30-6. withdraw_session_booking_request() を更新する
--       (対象テーブルをcom_t_session_slot_proposalへ変更。withdrawは自由予約リクエスト
--        (source_session_id IS NULL)のみに適用し、振替候補には適用しない旨を明示的にも
--        ガードする(DB制約chk_slot_proposal_withdraw_scopeでも機械的に担保済み))
---------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_session_booking_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
BEGIN
    SELECT * INTO v_request FROM public.com_t_session_slot_proposal WHERE proposal_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking request % not found', p_request_id;
    END IF;

    IF v_request.source_session_id IS NOT NULL THEN
        RAISE EXCEPTION 'reschedule proposals cannot be withdrawn; wait for a response or expiry';
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.student_id, 'not authorized to withdraw this booking request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'this booking request is no longer pending (status=%)', v_request.status;
    END IF;

    UPDATE public.com_t_session_slot_proposal
    SET status = 4, responded_at = NOW(), update_date = NOW()
    WHERE proposal_id = p_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.withdraw_session_booking_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_session_booking_request(uuid) TO authenticated;

---------------------------------------------
-- 30-7. cancel_session() を更新する
--       (振替候補提案のINSERT先をcom_t_session_reschedule_proposalからcom_t_session_slot_proposal
--        へ変更。schedule_id=v_session.schedule_id・source_session_id=p_session_idを設定する。
--        シグネチャ(uuid, text, jsonb, boolean, boolean)は「29. cancel_session: admin-proxy判定の
--        明示化」から変更しないため、DROP FUNCTIONは不要)
---------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_session(
    p_session_id uuid,
    p_reason text DEFAULT NULL,
    p_proposed_slots jsonb DEFAULT NULL,
    p_admin_refund_ticket boolean DEFAULT NULL,
    p_as_admin boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_cancel_category smallint;
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

    v_is_admin_proxy := p_as_admin;

    IF v_is_admin_proxy THEN
        -- p_as_admin=trueを名乗った場合、実際にアドミンロールであることを検証する
        -- （当事者本人と一致するかどうかは問わない）
        PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to cancel this session');
    ELSE
        -- p_as_admin=falseの場合は、消去法によるアドミン救済を行わず、当事者本人
        -- （生徒またはコーチ）であることを厳密に要求する
        IF auth.uid() IS DISTINCT FROM v_session.student_id AND auth.uid() IS DISTINCT FROM v_session.coach_id THEN
            RAISE EXCEPTION 'not authorized to cancel this session';
        END IF;
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
        v_cancel_category := 3; -- admin
        v_refunded := p_admin_refund_ticket;
    ELSIF v_session.student_id = auth.uid() THEN
        v_cancel_category := 1; -- student
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_cancel_category := 2; -- coach
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = 3, cancel_category = v_cancel_category, cancel_reason = p_reason, cancelled_by = auth.uid(),
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

            IF v_slot_start < NOW() + interval '24 hours' THEN
                RAISE EXCEPTION 'proposed time must be at least 24 hours from now';
            END IF;
            IF v_slot_end <= v_slot_start THEN
                RAISE EXCEPTION 'invalid proposed time range';
            END IF;

            SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
            FROM public.check_session_conflict(v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end, p_session_id);
            IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
            IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

            INSERT INTO public.com_t_session_slot_proposal (
                schedule_id, source_session_id, coach_id, student_id, proposed_start_datetime, proposed_end_datetime,
                proposed_by_role, status, expires_at
            ) VALUES (
                v_session.schedule_id, p_session_id, v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end,
                v_proposed_by_role, 1, NOW() + (v_proposal_validity_hours || ' hours')::interval
            );
        END LOOP;
    END IF;

    IF v_is_admin_proxy THEN
        PERFORM public.fn_notify(v_session.student_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/live-room');
        PERFORM public.fn_notify(v_session.coach_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/students/' || v_session.student_id);
    ELSIF v_is_coach THEN
        PERFORM public.fn_notify(
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
        PERFORM public.fn_notify(
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

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean, boolean) TO authenticated;

-- =========================================================================
-- 31. アドミンの振替(admin_reschedule_session)の廃止 (2026-09-15 追加)
-- =========================================================================
-- 【背景】
-- 生徒・コーチ向けの「振替」という独立概念は既に廃止し、cancel_session()+
-- create_session_booking_request()/approve_slot_proposal()の2ステップ（＝キャンセル＋予約）に
-- 置き換えていたが、アドミン専用の日時変更RPC(admin_reschedule_session)だけは、承認ステップを
-- 挟まず1回のRPC呼び出しで完結する「即時振替」として残っていた。マッチング〜予約管理ドメイン
-- 全体を「キャンセルと予約だけ」のシンプルな構成に揃えるため、本関数を廃止する。
--
-- アドミンが日時を変更したい場合は、今後は以下の2操作で行う。
--   1. cancel_session(p_session_id, p_reason, NULL, p_admin_refund_ticket=true, p_as_admin=true)
--      で対象セッションをキャンセルし、チケットを未割当に戻す（cancel_category=3(admin)）。
--   2. admin_book_session_direct(p_schedule_id, p_new_start_datetime, p_new_end_datetime, p_reason)
--      で、未割当に戻った同一スケジュール枠へ新しい日時で予約し直す。
-- admin_reschedule_session()が単一トランザクションで行っていた「旧行キャンセル＋新行作成」を
-- 2回の独立したRPC呼び出しに分割するため、新旧セッション行を紐づけるrescheduled_fromの
-- 自動設定は行われなくなる（旧行のcancel_reasonで経緯を追跡する）。
-- apps/admin側は、UI上の「振替」ボタン・RescheduleSessionDialogを削除し、
-- rescheduleSessionAsAdmin()サーバーアクションも削除済み（詳細はapps/admin/actions/
-- adminLiveSessionAction.ts, apps/admin/app/(app)/live-sessions/_components/を参照）。
-- =========================================================================
DROP FUNCTION IF EXISTS public.admin_reschedule_session(uuid, timestamptz, timestamptz, text);

-- =========================================================================
-- 32. 契約単位トレーニングレポート・コーチコメント (com_t_contract_training_report) (2026-09-16 追加)
-- =========================================================================
-- 【背景】
-- Student Overview画面（コーチ向け）で、契約(ticket)ごとのトレーニング完了時に作成する
-- レポートへ載せるコーチコメントの入力欄を、既存のCoach Notesカードの隣に追加する。
-- Coach Notes（コーチ自分専用・追記型履歴）とは異なり、本機能は
--   (1) 契約(ticket_id)×コーチ(coach_id)で1件（週2回契約等の分担時は分担コーチごとに1件）
--   (2) 一時保存(draft)→確定(finalized)の一方向遷移で、確定後は編集不可
--   (3) 確定済みのものは同じ生徒を担当している他コーチからも参照可能（ドラフト中は本人のみ）
-- という性質を持つ。詳細背景はsupabase/DDL/table/com_t_contract_training_report.sqlを参照。
--
-- 更新（下書き編集・確定）はいずれも単一テーブルへの単純な列更新のため、RPC化せず
-- 直接UPDATE + RLSのUSING句(status=1のみ更新可)で「確定後編集不可」を実現する。
-- =========================================================================
CREATE TABLE public.com_t_contract_training_report (
    report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    comment_text text NOT NULL DEFAULT '',
    status smallint NOT NULL DEFAULT 1, -- 1:draft(一時保存) 2:finalized(確定・以後編集不可)
    finalized_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    UNIQUE (ticket_id, coach_id),
    CONSTRAINT chk_training_report_status CHECK (status IN (1, 2))
);

COMMENT ON TABLE public.com_t_contract_training_report IS '契約(ticket)単位のトレーニングレポート・コーチコメント（ticket×coachで1件、draft→finalizedの一方向遷移）';
COMMENT ON COLUMN public.com_t_contract_training_report.report_id IS 'レポートID';
COMMENT ON COLUMN public.com_t_contract_training_report.ticket_id IS '対象の契約(ライブセッションチケット)ID';
COMMENT ON COLUMN public.com_t_contract_training_report.student_id IS '対象の生徒のユーザID（集計用の非正規化参照）';
COMMENT ON COLUMN public.com_t_contract_training_report.coach_id IS '記入したコーチのユーザID';
COMMENT ON COLUMN public.com_t_contract_training_report.comment_text IS 'コメント本文';
COMMENT ON COLUMN public.com_t_contract_training_report.status IS 'ステータス 1:draft(一時保存) 2:finalized(確定・以後編集不可)';
COMMENT ON COLUMN public.com_t_contract_training_report.finalized_at IS '確定日時（status=finalizedになった時刻）';
COMMENT ON COLUMN public.com_t_contract_training_report.insert_date IS '登録日時（下書き作成日時）';
COMMENT ON COLUMN public.com_t_contract_training_report.update_date IS '更新日時';

CREATE INDEX idx_contract_training_report_student ON public.com_t_contract_training_report (student_id);
CREATE INDEX idx_contract_training_report_coach ON public.com_t_contract_training_report (coach_id);

ALTER TABLE public.com_t_contract_training_report ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can view training reports of their students" ON public.com_t_contract_training_report;
DROP POLICY IF EXISTS "Coaches can create their own draft training reports" ON public.com_t_contract_training_report;
DROP POLICY IF EXISTS "Coaches can update their own draft training reports" ON public.com_t_contract_training_report;

CREATE POLICY "Coaches can view training reports of their students" ON public.com_t_contract_training_report
FOR SELECT TO authenticated USING (
    coach_id = auth.uid()
    OR (
        status = 2
        AND EXISTS (
            SELECT 1 FROM public.com_m_coach_student_relationship r
            WHERE r.coach_id = auth.uid() AND r.student_id = com_t_contract_training_report.student_id
        )
    )
    OR public.get_jwt_user_type() = '0'
);

CREATE POLICY "Coaches can create their own draft training reports" ON public.com_t_contract_training_report
FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.coach_id = auth.uid() AND r.student_id = com_t_contract_training_report.student_id AND r.is_active = true
    )
    AND EXISTS (
        SELECT 1 FROM public.com_t_user_session_ticket t
        WHERE t.ticket_id = com_t_contract_training_report.ticket_id AND t.user_id = com_t_contract_training_report.student_id
    )
);

CREATE POLICY "Coaches can update their own draft training reports" ON public.com_t_contract_training_report
FOR UPDATE TO authenticated USING (
    coach_id = auth.uid() AND status = 1
) WITH CHECK (
    coach_id = auth.uid()
);

-- =========================================================================
-- 33. resolve_stale_session: コーチ自身の無断欠席への対応 (2026-09-17 追加)
-- =========================================================================
-- 【背景】
-- 期限超過セッションの手動解決(resolve_stale_session)は、従来completion_result(1/2/3)の
-- いずれかで「完了」として記録する方法しか無く、コーチ自身が実施を失念した場合も
-- no_show(3)として記録するしかなかった。しかしno_showは本来「相手（生徒）が来なかった」ことを
-- 表す値であり、コーチの無断欠席をこれで記録すると事実と異なる印象を生徒側の履歴に残す上、
-- コーチキャンセル(cancel_session)が持つ「チケット常時返還」「生徒への通知」が一切行われない。
--
-- p_resolutionに4(coach_no_show)を渡した場合のみ例外的に、completion_resultを使わず
-- cancel_session()のコーチキャンセル分岐と同じ結果(status=3 cancelled, cancel_category=2 coach,
-- ticket_refunded=true)を記録し、生徒へfn_notify()で通知する。cancel_session()自体は
-- 「開始前セッションの事前キャンセル」専用にstart_datetime<=NOW()を禁止しているため、
-- 本関数（期限超過セッション専用）には統合せず、ここでのみ分岐を追加する。振替候補の提案
-- (proposed_slots)はcancel_session()と異なり本関数では提供しない（事後報告のためのシンプルな
-- 経路に留め、振替が必要な場合はコーチが別途生徒と調整する想定）。
--
-- 引数名をp_completion_result→p_resolutionに変更した（1-3はCOMPLETION_RESULTと値を共有し、
-- 4のみ例外でcompletion_resultカラムには入らない）。PostgreSQLはCREATE OR REPLACEのみでの
-- 引数名変更を許可しない（42P13エラー）ため、型・個数が同じでもDROP FUNCTIONが必要。
-- =========================================================================
DROP FUNCTION IF EXISTS public.resolve_stale_session(uuid, smallint, text);

CREATE OR REPLACE FUNCTION public.resolve_stale_session(p_session_id uuid, p_resolution smallint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_coach_name text;
BEGIN
    IF p_resolution NOT IN (1, 2, 3, 4) THEN
        RAISE EXCEPTION 'invalid resolution %', p_resolution;
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason required to resolve a stale session';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_session.coach_id, 'not authorized to resolve this session');

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.end_datetime > NOW() THEN
        RAISE EXCEPTION 'cannot resolve a session before its end time';
    END IF;

    IF p_resolution = 4 THEN
        UPDATE public.com_t_session
        SET status = 3, cancel_category = 2, cancel_reason = p_reason, cancelled_by = auth.uid(),
            ticket_refunded = true, update_date = NOW()
        WHERE session_id = p_session_id;

        SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_session.coach_id;
        PERFORM public.fn_notify(
            v_session.student_id,
            'SESSION_CANCELLED_BY_COACH',
            jsonb_build_object(
                'session_id', p_session_id,
                'coach_name', v_coach_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', 0
            ),
            '/live-room'
        );
        RETURN;
    END IF;

    UPDATE public.com_t_session
    SET status = 2, completion_result = p_resolution, status_note = p_reason, update_date = NOW()
    WHERE session_id = p_session_id;

    IF p_resolution = 1 THEN
        PERFORM public.fn_consume_session_ticket(v_session.ticket_id, p_reason);
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stale_session(uuid, smallint, text) TO authenticated;
