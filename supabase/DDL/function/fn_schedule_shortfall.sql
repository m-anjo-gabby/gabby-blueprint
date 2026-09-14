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
-- expected (2026-09-14変更): schedule.target_sessions（このコマが契約上持つべき目標
-- セッション数。承認時にtotal_sessions/weekly_frequencyの均等割りで確定、table/
-- com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）をそのまま返す。
-- 変更前はstart_date〜end_date間の対象曜日(day_of_week)の出現回数（暦週の数え上げ）を
-- expectedとしていたが、これはfn_generate_sessions_for_schedule()が実際に生成する回数の
-- 再計算にすぎず、マッチング承認が契約開始から遅れて生成本数が契約上の目標を
-- 恒久的に下回るケースを検知できなかった（expected自体が実績と同じロジックで
-- 導出されるため乖離が生じ得ない）。target_sessionsを契約上のエンタイトルメントを表す
-- 唯一の真実源とすることで、この乖離を正しくshortfallとして検知できるようにする。
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
--
-- 【アドミン代理キャンセルへの対応 (2026-09-09追加)】
-- cancelled_by_admin(10)もticket_refundedの値次第で occupied/available が変わる点は
-- 生徒・コーチキャンセル(3/4)と同じ扱いのため、actualの判定条件にstatus=10を追加する。
---------------------------------------------
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
