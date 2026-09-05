---------------------------------------------
-- 定期スケジュール単位の未割当チケット数(shortfall)算出関数 (2026-09-05 追加)
-- 前提: table/com_m_lesson_schedule.sql, table/com_t_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- packages/lib/coachStudent/actions/coachStudentActions.ts の
-- getStudentLiveSessionShortfallsCore が持っていた「未消化枠」計算ロジック
-- （countWeekdayOccurrencesによる対象曜日の出現回数=expectedと、
-- com_t_sessionの件数=actualの差分）を、チケット返還ルール対応のためSQL側に
-- 一本化する。以後、TS側・RPC側どちらもこの関数を唯一の真実源として使う。
--
-- expected: schedule.start_date〜end_date（両端含む）の間に、対象曜日(day_of_week)
-- が出現する回数（TS版countWeekdayOccurrencesと同じ、コーチのローカル日付基準）。
--
-- actual: com_t_session側で「その週の枠が消化済み扱い」となる行数。
--   - status IN (1,2,6,7): scheduled/completed/no_show/early_ended はいずれも
--     その週の枠を占有済みとみなす。
--   - status IN (3,4) AND ticket_refunded = false: 返還なしのキャンセル
--     （生徒による開始12時間未満のキャンセル）も消化済み扱い＝再予約不可。
--   - status IN (3,4) AND ticket_refunded = true: 返還ありのキャンセルは
--     未割当に戻るためactualから除外（＝shortfallが1増え、再予約可能になる）。
--   - status = 5 (rescheduled): 振替元の行はrescheduled_from経由で新しい行に
--     置き換わっているため、二重計上を避けるため除外する
--     （新しい行が別途status 1/2等でカウントされる）。
--
-- shortfall = GREATEST(expected - actual, 0)
--
-- 戻り値をexpected/actual/shortfallの3列テーブルとしているのは、Student Overview画面の
-- 「◯回中◯回」といった内訳表示（LiveSessionShortfallItem.expected_sessions/actual_sessions）
-- を、TS側で計算をやり直すことなくこの関数だけで賄うため。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_schedule_shortfall(p_schedule_id uuid)
RETURNS TABLE(expected_sessions integer, actual_sessions integer, shortfall integer)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_cursor_date date;
    v_expected integer := 0;
    v_actual integer;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date LOOP
        v_expected := v_expected + 1;
        v_cursor_date := v_cursor_date + 7;
    END LOOP;

    SELECT COUNT(*) INTO v_actual
    FROM public.com_t_session s
    WHERE s.schedule_id = p_schedule_id
      AND (
        s.status IN (1, 2, 6, 7)
        OR (s.status IN (3, 4) AND s.ticket_refunded = false)
      );

    RETURN QUERY SELECT v_expected, v_actual, GREATEST(v_expected - v_actual, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schedule_shortfall(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_schedule_shortfall(uuid) TO authenticated;
