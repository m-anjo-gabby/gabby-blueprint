-- =========================================================================
-- com_m_coach_specialty_assignment: コーチに設定した専門
-- =========================================================================
-- アドミンだけが設定し、admin_set_coach_specialties()（SECURITY DEFINER）でコーチ1人分をまとめて置き換える
-- （RLS での登録・変更・削除は許可しない）。コーチ本人が更新できる com_m_coach_profile とは別のテーブルにして、
-- コーチが書き換えられないようにしている。参照は認証済みユーザー全員（生徒のコーチ選択・コーチのプロフィール・アドミン）。
-- =========================================================================

-- @schema public.com_m_coach_specialty_assignment
CREATE TABLE public.com_m_coach_specialty_assignment (
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    specialty_code           text         NOT NULL REFERENCES public.com_m_coach_specialty(specialty_code),
    created_by               uuid         REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_m_coach_specialty_assignment_pkey PRIMARY KEY (coach_id, specialty_code)
);

COMMENT ON TABLE public.com_m_coach_specialty_assignment IS 'コーチの専門の設定（アドミンのみ設定。登録はadmin_set_coach_specialties()）';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.coach_id IS 'コーチのユーザID';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.specialty_code IS '専門コード（com_m_coach_specialty.specialty_code）';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.created_by IS '設定したアドミンのユーザID';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.insert_date IS '登録日時';

ALTER TABLE public.com_m_coach_specialty_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view coach specialty assignments" ON public.com_m_coach_specialty_assignment FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
