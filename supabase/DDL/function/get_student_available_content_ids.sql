---------------------------------------------
-- 指定生徒が利用可能なコンテンツID一覧の取得 (2026-09-24 追加)
--
-- 【背景】
-- コーチが生徒に教材を割り当てる／レッスンで使用する画面（Dialogue Practiceの割当、
-- Lesson Sprintの教材選択）は、可視範囲をcom_m_contentsのRLSに委ねていた。
-- しかしRLSはis_coach_content_accessible()により「コーチが一度でも担当した全生徒の
-- テナント」の限定公開(content_scope=1)教材を可視とするため、生徒Aの画面に生徒Bの
-- テナント（やコーチ自身のテナント）専用の教材まで表示・割当できてしまっていた。
--
-- 【用途】
-- 「対象生徒本人が生徒アプリで閲覧できる教材」と同じ範囲を、担当コーチの権限で返す。
--   - content_scope=0（共通）
--   - content_scope=1（クライアント限定）のうち、生徒のclient_idにcom_m_contents_accessがあるもの
--   - content_scope=9（非公開）・論理削除済みは常に除外
-- コーチはcom_m_userのRLSで生徒のclient_idを、com_m_contents_accessのRLSで他テナントの
-- アクセス権を参照できないため、SECURITY DEFINERで判定する。
-- 呼び出し元(auth.uid())が対象生徒の担当コーチ（com_m_coach_student_relationshipに行がある。
-- hasCoachStudentRelationshipと同じ意味論）でない場合は空集合を返す。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_student_available_content_ids(uuid, smallint);

CREATE OR REPLACE FUNCTION public.get_student_available_content_ids(
    p_student_id uuid,
    p_content_type smallint
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.content_id
  FROM public.com_m_contents c
  JOIN public.com_m_user u ON u.id = p_student_id
  WHERE c.content_type = p_content_type
    AND c.delete_flg = '0'
    AND c.content_scope <> 9
    AND EXISTS (
      SELECT 1 FROM public.com_m_coach_student_relationship r
      WHERE r.coach_id = auth.uid()
        AND r.student_id = p_student_id
    )
    AND (
      c.content_scope = 0
      OR EXISTS (
        SELECT 1 FROM public.com_m_contents_access a
        WHERE a.content_id = c.content_id
          AND a.client_id = u.client_id
          AND a.delete_flg = '0'
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_available_content_ids(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_available_content_ids(uuid, smallint) TO authenticated;
