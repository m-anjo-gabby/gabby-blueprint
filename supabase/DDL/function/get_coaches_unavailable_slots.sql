---------------------------------------------
-- コーチの予約済み枠（曜日・時間帯）一括取得ヘルパー関数 (2026-09-03 追加)
---------------------------------------------
-- 【背景】
-- 生徒向けマッチング申請カレンダー(RequestDialog)で、既に埋まっている曜日・時間帯を
-- 選択できないよう事前にグレーアウト表示するために使う（旅行・ホテル予約サイトの
-- 空室検索と同様のUXパターン）。あくまでUI側の事前ガイド（ソフトチェック）であり、
-- 最終的な整合性はcheck_coach_schedule_conflict()による申請時・承認時のチェックで担保する。
--
-- com_m_lesson_schedule/com_t_matching_requestはいずれもRLSで本人・担当コーチ・adminしか
-- 閲覧できないため、他の生徒の予約状況を横断的に見るにはSECURITY DEFINERが必須。
-- 戻り値は曜日・時間帯のみで、どの生徒が確保しているか（student_id等）は一切含めない。
--
-- 【対象】
-- 1. com_m_lesson_schedule (status=1: 稼働中) ... 承認済みの確定予約
-- 2. com_t_matching_request (status=1: pending) ... 承認待ちの申請
--    （承認待ち同士が重複しても申請時・承認時のハードチェックでは弾かないが、円滑な
--    マッチングのため、カレンダー上は先に申請された枠として選択不可にしておく）
--
-- 契約期間(start_date/end_date)による絞り込みは行わない（コーチのその曜日・時間帯が
-- 現に埋まっているかどうかの単純な表示用途のため。日付範囲まで含めた厳密な判定は
-- check_coach_schedule_conflict()側の役割とする）。
---------------------------------------------
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
