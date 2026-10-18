---------------------------------------------
-- コーチの担当生徒経由コンテンツアクセス判定ヘルパー関数
-- com_m_contentsのRLSポリシーから、コンテンツへのアクセス権を持つ生徒の
-- client_id(com_m_user.client_id)を判定しようとすると、com_m_user側の既存ポリシー
-- ("Users can view themselves and colleagues")がコーチ自身のclient_idしか許可しないため、
-- 生徒の行がRLSで不可視となり判定できない。
-- is_coach_of_contract_licenseと同様、SECURITY DEFINERで回避する。
--
-- 【用途】content_scope=1（クライアント限定）のコンテンツについて、コーチ自身のclient_id
-- では com_m_contents_access にマッチしない場合でも、コーチが担当する生徒（複数テナントを
-- 横断しうる）の client_id にアクセス権があれば閲覧を許可する。
-- 例: コーパススプリント教材（Lesson Sprintのコーチ向け教材選択画面）。
--
-- 担当関係は、スケジューリング用の com_m_lesson_schedule ではなく判定専用の派生マスタ
-- com_m_coach_student_relationship で判定する（statusを問わず、一度でも担当したことがあれば対象とする。
-- 詳細はtable/com_m_coach_student_relationship.sqlを参照）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.is_coach_content_accessible(p_content_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.com_m_coach_student_relationship r
    JOIN public.com_m_user u ON u.id = r.student_id
    JOIN public.com_m_contents_access a
      ON a.client_id = u.client_id
     AND a.content_id = p_content_id
    WHERE r.coach_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_coach_content_accessible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coach_content_accessible(uuid) TO authenticated;
