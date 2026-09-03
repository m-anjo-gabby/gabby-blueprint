-- =========================================================================
-- 繰り返しテスト用: マッチング申請情報の削除スクリプト
-- =========================================================================
-- 【用途】
-- マッチング申請→承認のテストを同一契約（チケット）で繰り返し行えるようにするため、
-- com_t_matching_request.request_id をキーに、当該申請から作られたマッチング結果を
-- 一括削除する。承認済み(status=2)以外（承認待ち/否認/取消）のrequest_idを指定しても、
-- その場合はcom_m_lesson_schedule側の削除が0件になるだけで安全に動作する。
--
-- 【使い方】
-- 下記 v_request_ids に、削除したい com_t_matching_request.request_id を列挙してから
-- 本スクリプトをSupabase Studio > SQL Editorで実行する。
--
-- 【削除対象と理由】
-- 1. com_m_lesson_schedule
--    com_m_lesson_schedule.source_request_id = 対象request_id で特定される行を削除する。
--    承認済みリクエストであればここで定期スケジュールが削除される（未承認なら0件）。
-- 2. com_t_session
--    schedule_idにON DELETE CASCADEが設定されているため、上記1の削除に自動追随して
--    削除される（本スクリプトで明示的な削除操作は不要）。
-- 3. com_t_matching_request
--    指定されたrequest_idの行そのものを削除する（今回の削除対象のキー）。
--    (ticket_id, slot_no)の部分ユニークインデックス(status IN (1,2)の行のみ対象)が
--    残っていると、同一チケット・同一枠への再申請がブロックされてしまうため必須。
--    com_m_lesson_schedule.source_request_idからこの行を参照するFKがあるため、
--    削除順序は必ず1→3（スケジュール側が先）でなければならない。
-- 4. com_m_coach_student_relationship
--    com_m_lesson_scheduleへの書き込みトリガー(sync_coach_student_relationship)により
--    is_activeは削除時点で自動的にfalseへ再計算されるが、行自体は本番の運用上「過去の
--    担当関係も引き継ぎ閲覧のため保持する」設計のため削除されない。本スクリプトは
--    テスト再実行専用のため、対象ペアに他の紐づくスケジュールが1件も残っていなければ
--    行自体を削除し、完全にクリーンな状態に戻す。
-- =========================================================================

DO $$
DECLARE
    v_request_ids uuid[] := ARRAY[
        '00000000-0000-0000-0000-000000000000'  -- ここに削除したいrequest_idを列挙（複数可）
    ]::uuid[];
    v_deleted_schedules integer;
    v_deleted_requests integer;
    v_deleted_relationships integer;
BEGIN
    -- 0. 削除前に、対象リクエストから作られたスケジュールの (coach_id, student_id) ペアを退避
    --    （未承認のrequest_idの場合は該当スケジュールが無いため空になる）
    CREATE TEMP TABLE tmp_target_pairs ON COMMIT DROP AS
    SELECT DISTINCT coach_id, student_id
    FROM public.com_m_lesson_schedule
    WHERE source_request_id = ANY(v_request_ids);

    -- 1-2. com_m_lesson_schedule を削除（com_t_sessionはCASCADEで自動追随）
    DELETE FROM public.com_m_lesson_schedule WHERE source_request_id = ANY(v_request_ids);
    GET DIAGNOSTICS v_deleted_schedules = ROW_COUNT;

    -- 3. マッチングリクエスト自体を削除
    DELETE FROM public.com_t_matching_request WHERE request_id = ANY(v_request_ids);
    GET DIAGNOSTICS v_deleted_requests = ROW_COUNT;

    -- 4. 対象ペアについて、他に紐づくスケジュールが残っていなければ担当関係行も削除
    DELETE FROM public.com_m_coach_student_relationship r
    USING tmp_target_pairs p
    WHERE r.coach_id = p.coach_id AND r.student_id = p.student_id
      AND NOT EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule s
        WHERE s.coach_id = r.coach_id AND s.student_id = r.student_id
      );
    GET DIAGNOSTICS v_deleted_relationships = ROW_COUNT;

    RAISE NOTICE 'deleted: com_t_matching_request=%, com_m_lesson_schedule=%, com_m_coach_student_relationship=%',
        v_deleted_requests, v_deleted_schedules, v_deleted_relationships;
END $$;

-- =========================================================================
-- 動作確認クエリ（実行後に任意で実行してください）
-- =========================================================================
-- SELECT * FROM public.com_t_matching_request WHERE request_id = ANY(ARRAY['<request_id>']::uuid[]);
-- SELECT * FROM public.com_m_lesson_schedule WHERE source_request_id = ANY(ARRAY['<request_id>']::uuid[]);
