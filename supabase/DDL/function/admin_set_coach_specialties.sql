---------------------------------------------
-- アドミンによるコーチの専門の設定RPC
-- 前提: table/com_m_coach_specialty.sql, table/com_m_coach_specialty_assignment.sql の作成が完了していること。
---------------------------------------------
-- admin のユーザー管理 → コーチの「専門」ダイアログで使う。コーチ1人分の専門を、渡したコードの集合に置き換える
-- （外したものを削除し、足したものを登録する。続けて設定されているものは登録日時を変えない）。
-- 検証:
--   - アドミン（JWT の user_type='0'）以外は NOT_AUTHORIZED
--   - 対象がコーチでない（存在しない）場合は COACH_NOT_FOUND
--   - 有効なマスタに無いコードは INVALID_SPECIALTY
--   - 分野（kind='field'）は4つまで（TOO_MANY_FIELDS）。得意分野（kind='skill'）は数えない。
--     上限はアプリ側の COACH_SPECIALTY_FIELD_MAX（packages/types/coachSpecialty.ts）と揃える。
-- 返り値: 設定後の専門コード（マスタの表示順）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_coach_specialties(p_coach_id uuid, p_specialty_codes text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c_field_max CONSTANT integer := 4;
    v_codes text[];
    v_invalid text;
    v_field_count integer;
BEGIN
    IF COALESCE(public.get_jwt_user_type(), '') <> '0' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: only admins can set coach specialties';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.com_m_user WHERE id = p_coach_id AND user_type = '2') THEN
        RAISE EXCEPTION 'COACH_NOT_FOUND: %', p_coach_id;
    END IF;

    -- 同じコーチへの同時の設定を順番に処理する（置き換えの途中で混ざらないようにする）
    PERFORM pg_advisory_xact_lock(hashtext('coach_specialty:' || p_coach_id::text));

    v_codes := ARRAY(SELECT DISTINCT unnest(COALESCE(p_specialty_codes, ARRAY[]::text[])));

    SELECT c INTO v_invalid
    FROM unnest(v_codes) AS c
    WHERE NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_specialty s
        WHERE s.specialty_code = c AND s.is_active
    )
    LIMIT 1;
    IF v_invalid IS NOT NULL THEN
        RAISE EXCEPTION 'INVALID_SPECIALTY: %', v_invalid;
    END IF;

    SELECT count(*) INTO v_field_count
    FROM public.com_m_coach_specialty s
    WHERE s.specialty_code = ANY(v_codes) AND s.kind = 'field';
    IF v_field_count > c_field_max THEN
        RAISE EXCEPTION 'TOO_MANY_FIELDS: % (max %)', v_field_count, c_field_max;
    END IF;

    DELETE FROM public.com_m_coach_specialty_assignment
    WHERE coach_id = p_coach_id AND NOT (specialty_code = ANY(v_codes));

    INSERT INTO public.com_m_coach_specialty_assignment (coach_id, specialty_code, created_by)
    SELECT p_coach_id, c, auth.uid()
    FROM unnest(v_codes) AS c
    ON CONFLICT (coach_id, specialty_code) DO NOTHING;

    RETURN ARRAY(
        SELECT a.specialty_code
        FROM public.com_m_coach_specialty_assignment a
        JOIN public.com_m_coach_specialty s ON s.specialty_code = a.specialty_code
        WHERE a.coach_id = p_coach_id
        ORDER BY s.sort_no
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_coach_specialties(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_coach_specialties(uuid, text[]) TO authenticated;
