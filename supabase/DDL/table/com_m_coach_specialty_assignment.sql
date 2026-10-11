---------------------------------------------
-- DDL: com_m_coach_specialty_assignment (コーチの専門の設定) (2026-10-11 追加)
-- 前提: table/com_m_coach_specialty.sql, table/com_m_user.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチごとに設定した専門（com_m_coach_specialty）。設定はアドミンのみで、
-- admin_set_coach_specialties() でコーチ1人分をまとめて置き換える（RLSでの登録・変更・削除は許可しない）。
-- コーチ本人が更新できる com_m_coach_profile とは別のテーブルにして、コーチが書き換えられないようにする。
-- 参照は認証済みユーザー全員（生徒のコーチ選択・コーチのプロフィール・アドミン）。
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_m_coach_specialty_assignment (
  coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  specialty_code text NOT NULL REFERENCES public.com_m_coach_specialty(specialty_code),
  created_by uuid REFERENCES public.com_m_user(id) ON DELETE SET NULL,
  insert_date timestamp with time zone not null default now(),
  PRIMARY KEY (coach_id, specialty_code)
);

COMMENT ON TABLE public.com_m_coach_specialty_assignment IS 'コーチの専門の設定（アドミンのみ設定。登録はadmin_set_coach_specialties()）';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.coach_id IS 'コーチのユーザID';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.specialty_code IS '専門コード（com_m_coach_specialty.specialty_code）';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.created_by IS '設定したアドミンのユーザID';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.insert_date IS '登録日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_coach_specialty_assignment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view coach specialty assignments" ON public.com_m_coach_specialty_assignment;

CREATE POLICY "Anyone can view coach specialty assignments" ON public.com_m_coach_specialty_assignment
FOR SELECT TO authenticated USING (true);

-- 登録・削除は admin_set_coach_specialties()（SECURITY DEFINER）経由のみ。更新系ポリシーは意図的に定義していない。
