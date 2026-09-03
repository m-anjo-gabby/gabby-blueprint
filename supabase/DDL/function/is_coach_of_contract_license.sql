---------------------------------------------
-- 契約の担当コーチ判定ヘルパー関数
-- com_m_contractのRLSポリシーからcom_t_user_licenseを参照すると、
-- com_t_user_license側の既存ポリシー("Users can view relevant licenses")が
-- com_m_contractを参照しているため、2テーブル間の循環参照
-- (infinite recursion detected in policy for relation) になる。
-- SECURITY DEFINER で回避する（is_chat_room_memberと同様のパターン）
--
-- 2026-09-03: 担当関係の判定元をcom_m_lesson_schedule（スケジューリング用データ）から
-- 判定専用の派生マスタcom_m_coach_student_relationshipに変更（意味論・挙動は変更なし。
-- 詳細はtable/com_m_coach_student_relationship.sqlを参照）。
---------------------------------------------
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

REVOKE EXECUTE ON FUNCTION public.is_coach_of_contract_license(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coach_of_contract_license(uuid) TO authenticated;
