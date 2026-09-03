-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260903-hotfix
-- 作成日: 2026-09-03
--
-- 【内容】
--   不具合修正: コーチ向け Lesson Sprint 教材選択画面で
--   コーパススプリント（content_scope=1: クライアント限定コンテンツ）が
--   "No sprint content available" となり選択できない不具合の修正、および
--   その修正過程で洗い出した「コーチ⇔生徒の担当関係」判定ロジックの整理
--
--   【不具合の原因】
--   com_m_contents の RLSポリシーは、content_scope=1（クライアント限定）のコンテンツを
--   「閲覧者自身のclient_id」に対する com_m_contents_access の許可レコードでのみ可視化していた。
--   コーチは複数テナントの生徒を横断的に担当するため、コーチ自身のclient_id（生徒の所属テナントとは
--   無関係）では当該コンテンツにマッチせず、RLSに弾かれて0件になっていた
--   （生徒本人は自分のclient_idで正しく可視）。
--
--   【リファクタリングの背景】
--   上記の担当コーチ判定を実装する過程で、従来「コーチ⇔生徒の担当関係」判定に
--   com_m_lesson_schedule（本来は毎週◯曜◯時の定期スケジュールパターンを持つ、
--   スケジューリング用のデータ）を「行が存在するか」「status=1(active)の行があるか」
--   だけを見て流用している箇所が、Student Overview閲覧・生徒のスプリント進捗閲覧/編集・
--   ライセンス/契約参照・ライブセッションルーム入室可否など複数の箇所にわたって存在することが
--   判明した。スケジューリング側の都合（週n回契約でslot_noごとに複数行、将来のpause/terminate
--   フロー等）が意図せずセキュリティ判定側に波及するのを避けるため、判定専用の派生マスタに
--   切り出す。
--
--   1. com_m_coach_student_relationship テーブルを新規作成
--      - 1ペア(coach_id, student_id)につき1行。is_active は対象ペアのcom_m_lesson_schedule行に
--        1件でもstatus=1があればtrue。行自体は担当解消後も削除せず、引き継ぎ閲覧のため保持する。
--   2. sync_coach_student_relationship() トリガー関数を新規作成し、com_m_lesson_scheduleへの
--      INSERT/UPDATE/DELETEに設置。書き込みのたびに対象ペアの行を自動的にupsertする
--      （複数スロットがある場合も、常に該当ペアの全行を再集計するため安全）。
--   3. 既存データの初期バックフィル（com_m_lesson_scheduleから集計して投入）
--   4. is_coach_of_contract_license()（com_m_contractの閲覧ポリシーが利用）の判定元を
--      com_m_coach_student_relationshipに変更（意味論・挙動は変更なし）
--   5. is_coach_content_accessible() を新規作成 (SECURITY DEFINER)
--      - コーチが担当する生徒（テナント横断しうる）の client_id に、対象コンテンツへの
--        com_m_contents_access が存在するかを判定する。com_m_userのRLSが生徒の行をコーチから
--        不可視にしてしまうため、is_coach_of_contract_licenseと同様SECURITY DEFINERで回避する。
--   6. com_m_contents のRLSポリシーに、is_coach_content_accessible()によるOR条件を追加
--      - 既存の「共通コンテンツ(content_scope=0)」「閲覧者自身のclient_idでのアクセス権」は
--        そのまま維持し、コーチの担当生徒経由のアクセス権チェックを追加するのみ(追加の許可のみ)。
--   7. student_m_sprint_progress（閲覧・更新）、com_t_user_license（閲覧）の
--      担当コーチ向けポリシーの判定元をcom_m_coach_student_relationshipに変更
--      （意味論・挙動は変更なし）
--
--   不具合修正: コーチマッチングにおけるダブルブッキング防止
--   【不具合の内容】
--   生徒がコーチへマッチング申請し、コーチが承認した際、当該コーチが同じ曜日・時間帯に
--   別途稼働中のスケジュールを既に持っていてもチェックされず、そのまま予約が成立して
--   ダブルブッキングが発生する不具合があった。
--
--   8. check_coach_schedule_conflict() を新規作成 (SECURITY DEFINER)
--      - 指定コーチ・曜日・時間帯・契約期間の組み合わせが、当該コーチの既存の稼働中スケジュール
--        (com_m_lesson_schedule.status=1)と重複するかを判定する。生徒からは他の生徒の
--        スケジュールがRLSで不可視のため、SECURITY DEFINERで判定する。
--   9. approve_matching_request() を更新
--      - 承認処理の中で、対象(coach_id, day_of_week)単位のアドバイザリロックを取得した上で
--        check_coach_schedule_conflict()による重複再チェックを行い、重複時は例外を送出して
--        承認を中断する（申請〜承認の間に別の申請が先に承認される競合(TOCTOU)対策）。
--        本関数内で取得するロックは常にこの1本のみのため、デッドロックは起こり得ない。
--
--   UX改善: マッチング申請カレンダーで、既に埋まっている枠を選択不可にする
--   【背景】
--   ダブルブッキング防止のサーバー側チェックは上記8/9で担保済みだが、生徒が申請する時点では
--   埋まっている枠かどうかがカレンダー上で分からず、送信して初めてエラーになっていた。
--   旅行・ホテル予約サイトの空室検索と同様に、埋まっている枠は最初から選択できないようにする。
--
--   10. get_coaches_unavailable_slots() を新規作成 (SECURITY DEFINER)
--      - 指定コーチ群について、確定済み(com_m_lesson_schedule.status=1)および承認待ち
--        (com_t_matching_request.status=1)の曜日・時間帯を一括取得する。誰が確保しているか
--        （student_id等）は返さない。承認待ち同士の重複は申請時・承認時のハードチェックでは
--        弾かない方針のため、本関数のみが承認待ち同士の重複を防ぐソフトチェックとして機能する
--        （それでも重複が発生した場合はコーチが個別に調整する）。
--
--   UX追加: 契約セッション数に対する未消化枠のコーチ向けアラート
--   【背景】
--   マッチング申請が契約のライセンス開始日より後に承認されると、その分だけ契約期間内に
--   生成できるセッション回数が本来の想定を下回る（例: 6-9月・週1・全12回の契約で6月中旬に
--   承認された場合、数回分は契約期間内に収まらない）。振替・個別予約の導線は別途検討中のため、
--   現時点ではStudent Overview画面での検知・アラート表示のみを行う。
--
--   11. com_t_user_session_ticket に、担当コーチ向けの参照許可ポリシーを追加
--      - 上記アラートの算出（ticketのtotal_sessions/weekly_frequency、および紐づく
--        com_t_user_licenseの契約期間の参照）に必要。com_m_coach_student_relationshipで
--        結びついたコーチ(status不問)のみが対象で、既存の本人・契約先クライアント向け
--        ポリシーはそのまま残る(追加の許可のみ)。実際の未消化枠の算出（契約開始日を起点に
--        本来確保できたはずの曜日出現回数と、実際に生成されたcom_t_sessionの件数を比較する
--        ロジック）はアプリケーションコード側(coachStudentActions.ts)で行う。
--
--   アプリケーションコード側の変更（coachStudentActions.ts, liveSessionRoomActions.tsの
--   クエリ差し替え、matchingActions.tsへの申請時重複チェック・カレンダー用データ取得の追加、
--   RequestDialog/CoachAvailabilityCalendarの選択不可表示、未消化枠アラートの算出・表示）は
--   本SQLの対象外（DB変更のみ）。
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   再実行しても副作用がないよう、全ステップを冪等（CREATE TABLE IF NOT EXISTS /
--   CREATE OR REPLACE / DROP POLICY IF EXISTS / DROP TRIGGER IF EXISTS / ON CONFLICT）に
--   作成しています。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. com_m_coach_student_relationship 新規作成
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_m_coach_student_relationship (
    relationship_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    student_id uuid NOT NULL REFERENCES public.com_m_user(id),
    is_active boolean NOT NULL DEFAULT true,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    UNIQUE(coach_id, student_id)
);

COMMENT ON TABLE public.com_m_coach_student_relationship IS 'コーチ⇔生徒 担当関係マスタ（com_m_lesson_scheduleからトリガーで自動同期される判定専用の派生データ）';
COMMENT ON COLUMN public.com_m_coach_student_relationship.relationship_id IS '担当関係ID';
COMMENT ON COLUMN public.com_m_coach_student_relationship.coach_id IS 'コーチのユーザID';
COMMENT ON COLUMN public.com_m_coach_student_relationship.student_id IS '生徒のユーザID';
COMMENT ON COLUMN public.com_m_coach_student_relationship.is_active IS '現役の担当関係か（対象ペアのcom_m_lesson_schedule行に1件でもstatus=1があればtrue）。行自体は担当解消後も削除せず、引き継ぎ閲覧のため保持する';
COMMENT ON COLUMN public.com_m_coach_student_relationship.insert_date IS '登録日時（初回マッチング日時）';
COMMENT ON COLUMN public.com_m_coach_student_relationship.update_date IS '更新日時（is_active最終更新日時）';

CREATE INDEX IF NOT EXISTS idx_coach_student_relationship_student ON public.com_m_coach_student_relationship (student_id);

ALTER TABLE public.com_m_coach_student_relationship ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view coach student relationships" ON public.com_m_coach_student_relationship;
CREATE POLICY "Involved users can view coach student relationships" ON public.com_m_coach_student_relationship
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- =========================================================================
-- 2. sync_coach_student_relationship() トリガー関数 + トリガー設置
-- =========================================================================
CREATE OR REPLACE FUNCTION public.sync_coach_student_relationship()
RETURNS TRIGGER AS $$
DECLARE
    v_coach_id uuid;
    v_student_id uuid;
    v_is_active boolean;
BEGIN
    v_coach_id := COALESCE(NEW.coach_id, OLD.coach_id);
    v_student_id := COALESCE(NEW.student_id, OLD.student_id);

    SELECT EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule
        WHERE coach_id = v_coach_id AND student_id = v_student_id AND status = 1
    ) INTO v_is_active;

    INSERT INTO public.com_m_coach_student_relationship (coach_id, student_id, is_active)
    VALUES (v_coach_id, v_student_id, v_is_active)
    ON CONFLICT (coach_id, student_id) DO UPDATE
    SET is_active = EXCLUDED.is_active, update_date = NOW();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_lesson_schedule_change_sync_relationship ON public.com_m_lesson_schedule;
CREATE TRIGGER on_lesson_schedule_change_sync_relationship
AFTER INSERT OR UPDATE OR DELETE ON public.com_m_lesson_schedule
FOR EACH ROW EXECUTE PROCEDURE public.sync_coach_student_relationship();

REVOKE EXECUTE ON FUNCTION public.sync_coach_student_relationship() FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 3. 既存データの初期バックフィル
-- =========================================================================
INSERT INTO public.com_m_coach_student_relationship (coach_id, student_id, is_active)
SELECT coach_id, student_id, bool_or(status = 1)
FROM public.com_m_lesson_schedule
GROUP BY coach_id, student_id
ON CONFLICT (coach_id, student_id) DO UPDATE
SET is_active = EXCLUDED.is_active, update_date = NOW();

-- =========================================================================
-- 4. is_coach_of_contract_license()（com_m_contractの閲覧ポリシーが利用）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_coach_of_contract_license(p_contract_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.com_t_user_license l
    JOIN public.com_m_coach_student_relationship r ON r.student_id = l.user_id
    WHERE l.contract_id = p_contract_id
      AND r.coach_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- =========================================================================
-- 5. is_coach_content_accessible() 新規作成（com_m_contentsの閲覧ポリシーが利用）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_coach_content_accessible(p_content_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.com_m_coach_student_relationship r
    JOIN public.com_m_user u ON u.id = r.student_id
    JOIN public.com_m_contents_access a
      ON a.client_id = u.client_id
     AND a.content_id = p_content_id
     AND a.delete_flg = '0'
    WHERE r.coach_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_coach_content_accessible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coach_content_accessible(uuid) TO authenticated;

-- =========================================================================
-- 6. com_m_contents: RLSポリシーにコーチの担当生徒経由アクセスを追加
-- =========================================================================
DROP POLICY IF EXISTS "Users can view common or assigned corpora" ON public.com_m_contents;

CREATE POLICY "Users can view common or assigned corpora" ON public.com_m_contents
FOR SELECT TO authenticated USING (
    delete_flg = '0'
    AND content_scope <> 9 -- 非公開(9)は常に除外
    AND (
        content_scope = 0
        OR EXISTS (
            SELECT 1 FROM public.com_m_contents_access a
            WHERE a.content_id = public.com_m_contents.content_id
              AND a.client_id = public.get_jwt_client_id()
              AND a.delete_flg = '0'
        )
        OR public.is_coach_content_accessible(public.com_m_contents.content_id)
    )
);

-- =========================================================================
-- 7. student_m_sprint_progress / com_t_user_license: 担当コーチ向けポリシーの判定元差し替え
-- =========================================================================

-- 7-1. student_m_sprint_progress: 閲覧ポリシー
DROP POLICY IF EXISTS "Coaches can view sprint progress of their students" ON public.student_m_sprint_progress;
CREATE POLICY "Coaches can view sprint progress of their students" ON public.student_m_sprint_progress
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = student_m_sprint_progress.user_id AND r.coach_id = auth.uid()
    )
);

-- 7-2. student_m_sprint_progress: 更新ポリシー
DROP POLICY IF EXISTS "Coaches can update sprint progress of their students" ON public.student_m_sprint_progress;
CREATE POLICY "Coaches can update sprint progress of their students" ON public.student_m_sprint_progress
FOR UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = student_m_sprint_progress.user_id AND r.coach_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = student_m_sprint_progress.user_id AND r.coach_id = auth.uid()
    )
);

-- 7-3. com_t_user_license: 閲覧ポリシー
DROP POLICY IF EXISTS "Coaches can view licenses of their students" ON public.com_t_user_license;
CREATE POLICY "Coaches can view licenses of their students" ON public.com_t_user_license
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_user_license.user_id AND r.coach_id = auth.uid()
    )
);

-- =========================================================================
-- 8. check_coach_schedule_conflict() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.check_coach_schedule_conflict(
    p_coach_id uuid,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_start_date date,
    p_end_date date
)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.com_m_lesson_schedule s
    WHERE s.coach_id = p_coach_id
      AND s.day_of_week = p_day_of_week
      AND s.status = 1
      AND s.start_time < p_end_time AND s.end_time > p_start_time
      AND s.start_date <= p_end_date AND s.end_date >= p_start_date
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.check_coach_schedule_conflict(uuid, smallint, time, time, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_coach_schedule_conflict(uuid, smallint, time, time, date, date) TO authenticated;

-- =========================================================================
-- 9. approve_matching_request(): 承認時の重複チェック + アドバイザリロックを追加
-- =========================================================================
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

    -- 対象チケットに紐づくライセンス期間を取得（Session生成範囲の基準）
    SELECT l.start_date::date, l.end_date::date
    INTO v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = v_request.ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', v_request.ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    -- 同一コーチ×同一曜日への承認を直列化し、重複チェックのレース条件を防ぐ
    -- （本関数内で取得するロックは常にこの1本のみのため、デッドロックは起こり得ない）
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
        coach_timezone, status, start_date, end_date, source_request_id
    ) VALUES (
        v_request.ticket_id, v_request.student_id, v_request.coach_id, v_request.slot_no,
        v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, v_request.request_id
    )
    RETURNING schedule_id INTO v_schedule_id;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;

-- =========================================================================
-- 10. get_coaches_unavailable_slots() 新規作成
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_coaches_unavailable_slots(p_coach_ids uuid[])
RETURNS TABLE (coach_id uuid, day_of_week smallint, start_time time, end_time time) AS $$
  SELECT s.coach_id, s.day_of_week, s.start_time, s.end_time
  FROM public.com_m_lesson_schedule s
  WHERE s.coach_id = ANY(p_coach_ids) AND s.status = 1
  UNION
  SELECT r.coach_id, r.requested_day_of_week, r.requested_start_time, r.requested_end_time
  FROM public.com_t_matching_request r
  WHERE r.coach_id = ANY(p_coach_ids) AND r.status = 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_coaches_unavailable_slots(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coaches_unavailable_slots(uuid[]) TO authenticated;

-- =========================================================================
-- 11. com_t_user_session_ticket: 担当コーチ向けの参照許可ポリシー追加
-- =========================================================================
DROP POLICY IF EXISTS "Coaches can view session tickets of their students" ON public.com_t_user_session_ticket;
CREATE POLICY "Coaches can view session tickets of their students" ON public.com_t_user_session_ticket
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_user_session_ticket.user_id AND r.coach_id = auth.uid()
    )
);

COMMIT;

-- =========================================================================
-- 動作確認クエリ（COMMIT後に任意で実行してください）
-- =========================================================================
-- SELECT * FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'com_m_coach_student_relationship';
--
-- SELECT policyname FROM pg_policies WHERE tablename = 'com_m_coach_student_relationship';
--
-- SELECT proname, pronargs FROM pg_proc
-- WHERE proname IN ('sync_coach_student_relationship', 'is_coach_of_contract_license', 'is_coach_content_accessible');
--
-- SELECT tgname FROM pg_trigger WHERE tgname = 'on_lesson_schedule_change_sync_relationship';
--
-- -- バックフィル結果が既存のcom_m_lesson_scheduleのペア数と一致するか確認
-- SELECT
--   (SELECT COUNT(*) FROM public.com_m_coach_student_relationship) AS relationship_rows,
--   (SELECT COUNT(DISTINCT (coach_id, student_id)) FROM public.com_m_lesson_schedule) AS distinct_schedule_pairs;
--
-- -- is_active が実データと整合しているか（不一致0件が正常）
-- SELECT r.coach_id, r.student_id, r.is_active
-- FROM public.com_m_coach_student_relationship r
-- WHERE r.is_active <> EXISTS (
--   SELECT 1 FROM public.com_m_lesson_schedule s
--   WHERE s.coach_id = r.coach_id AND s.student_id = r.student_id AND s.status = 1
-- );
--
-- SELECT policyname, qual FROM pg_policies
-- WHERE tablename = 'com_m_contents' AND policyname = 'Users can view common or assigned corpora';
--
-- SELECT policyname FROM pg_policies
-- WHERE tablename = 'student_m_sprint_progress'
--   AND policyname IN ('Coaches can view sprint progress of their students', 'Coaches can update sprint progress of their students');
--
-- SELECT policyname FROM pg_policies
-- WHERE tablename = 'com_t_user_license' AND policyname = 'Coaches can view licenses of their students';
--
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'check_coach_schedule_conflict';
--
-- -- 重複判定の動作確認（実在のcoach_id/曜日/時間帯/期間で試す。既存の稼働中スケジュールと
-- -- 重ならない組み合わせではfalse、重なる組み合わせではtrueが返るはず）
-- SELECT public.check_coach_schedule_conflict(
--   '<coach_id>'::uuid, 4, '21:00:00'::time, '21:25:00'::time, CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days'
-- );
--
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'get_coaches_unavailable_slots';
--
-- -- 予約済み枠一括取得の動作確認
-- SELECT * FROM public.get_coaches_unavailable_slots(ARRAY['<coach_id>']::uuid[]);
--
-- SELECT policyname FROM pg_policies
-- WHERE tablename = 'com_t_user_session_ticket'
--   AND policyname = 'Coaches can view session tickets of their students';
