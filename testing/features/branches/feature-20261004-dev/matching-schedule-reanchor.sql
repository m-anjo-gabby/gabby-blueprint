-- =========================================================================
-- 既存の定期スケジュールを生徒の時刻の基準に直すデータメンテナンス（dev / staging のテストデータ用）
-- 作成日: 2026-10-06
--
-- 【背景】
-- リリース 20261004 のセクション12で、定期スケジュールの曜日・時刻は申請時の生徒のタイムゾーンを基準にするようになった。
-- それより前に成立した行は schedule_timezone がコーチのタイムゾーンのままで、コーチ側の夏時間の切り替え後は
-- 生徒側の時刻が1時間ずれる（例: バンクーバーの月曜18:00 = 日本時間の火曜10:00 → 11/1以降は火曜11:00）。
--
-- 【内容】（schedule_timezone が生徒の現在のタイムゾーンと異なる、稼働中の定期スケジュールが対象）
--   1. 未来の予定（status=1）の定期の回のうち、生徒側の時刻が成立時の最初の回と違う回を、その時刻に戻す
--      （定期の回 = 基準のタイムゾーンで曜日・時刻が枠と一致する回。個別予約・振替の回は変更しない）
--   2. 定期スケジュールの曜日・時刻・期間を、成立時の最初の回の生徒側の値にし、schedule_timezone を生徒のタイムゾーンにする
--   - 過去の回・申請の履歴（com_t_matching_request）は変更しない。
--   - 移動後に、コーチ・生徒の他の予定と重なる回がある場合は、何も変更せずにエラーで止める。
--   - 対象が無くなるため、2回目以降の実行は何もしない。
--   - リマインダーメールは開始の24時間前から登録されるため、移動する回がすべて25時間以上先であることを確かめる
--     （近い回があればエラーで止める。その場合はリマインダーの扱いを個別に確認する）。
--
-- 【実行】dev で 2026-10-06 に実行済み（9件のスケジュール・16回を移動。期間の日付は別途同じ考え方で補正済み）。staging で行う場合は同じSQLをそのまま実行する。
-- =========================================================================
BEGIN;

CREATE TEMP TABLE tmp_reanchor ON COMMIT DROP AS
WITH sched AS (
    SELECT s.schedule_id, s.schedule_timezone AS old_tz, su.timezone AS new_tz,
           s.day_of_week, s.start_time, s.end_time, s.start_date, s.end_date,
           -- 成立時の最初の回（生徒が合意した時刻）と、期間内の最後の回
           (s.start_date + ((s.day_of_week - EXTRACT(DOW FROM s.start_date)::int + 7) % 7) + s.start_time)
               AT TIME ZONE s.schedule_timezone AS ref_ts,
           (s.end_date - ((EXTRACT(DOW FROM s.end_date)::int - s.day_of_week + 7) % 7) + s.start_time)
               AT TIME ZONE s.schedule_timezone AS last_ts
    FROM public.com_m_lesson_schedule s
    JOIN public.com_m_user su ON su.id = s.student_id
    WHERE s.status = 1 AND s.schedule_timezone <> su.timezone
)
SELECT sched.*,
       (ref_ts AT TIME ZONE new_tz)::time AS ref_time,
       EXTRACT(DOW FROM ref_ts AT TIME ZONE new_tz)::smallint AS ref_dow
FROM sched;

CREATE TEMP TABLE tmp_moves ON COMMIT DROP AS
SELECT x.session_id, x.coach_id, x.student_id, x.start_datetime, x.end_datetime,
       CASE WHEN d.raw > interval '12 hours' THEN d.raw - interval '24 hours'
            WHEN d.raw < interval '-12 hours' THEN d.raw + interval '24 hours'
            ELSE d.raw END AS delta
FROM tmp_reanchor r
JOIN public.com_t_session x ON x.schedule_id = r.schedule_id
CROSS JOIN LATERAL (SELECT r.ref_time - (x.start_datetime AT TIME ZONE r.new_tz)::time AS raw) d
WHERE x.status = 1
  AND x.start_datetime > NOW()
  AND EXTRACT(DOW FROM x.start_datetime AT TIME ZONE r.old_tz) = r.day_of_week
  AND (x.start_datetime AT TIME ZONE r.old_tz)::time = r.start_time
  AND d.raw <> interval '0';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM tmp_moves m
        JOIN public.com_t_session o
          ON o.status = 1 AND o.session_id <> m.session_id
         AND (o.coach_id = m.coach_id OR o.student_id = m.student_id)
         AND o.start_datetime < m.end_datetime + m.delta
         AND o.end_datetime > m.start_datetime + m.delta
    ) THEN
        RAISE EXCEPTION 'moved sessions would overlap other sessions';
    END IF;
    IF EXISTS (SELECT 1 FROM tmp_moves m WHERE m.start_datetime < NOW() + interval '25 hours') THEN
        RAISE EXCEPTION 'a session to be moved starts within 25 hours (reminder mails may already be queued)';
    END IF;
END $$;

UPDATE public.com_t_session x
SET start_datetime = m.start_datetime + m.delta,
    end_datetime = m.end_datetime + m.delta,
    update_date = NOW()
FROM tmp_moves m
WHERE x.session_id = m.session_id;

UPDATE public.com_m_lesson_schedule s
SET day_of_week = r.ref_dow,
    start_time = r.ref_time,
    end_time = r.ref_time + (r.end_time - r.start_time),
    schedule_timezone = r.new_tz,
    -- 期間は最初の回・最後の回の生徒側の日付にする（期間の日付をそのまま換算すると、生徒側の曜日では
    -- 最初の回より前の日・最後の回より後の日が範囲に入り、回の数え方がずれる）
    start_date = (r.ref_ts AT TIME ZONE r.new_tz)::date,
    end_date = (r.last_ts AT TIME ZONE r.new_tz)::date,
    update_date = NOW()
FROM tmp_reanchor r
WHERE s.schedule_id = r.schedule_id;

SELECT (SELECT count(*) FROM tmp_reanchor) AS schedules, (SELECT count(*) FROM tmp_moves) AS moved_sessions;

COMMIT;
