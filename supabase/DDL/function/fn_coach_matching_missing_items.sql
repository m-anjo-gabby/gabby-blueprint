---------------------------------------------
-- コーチがマッチング対象になるために足りない項目 (2026-10-11 追加)
-- 前提: table/com_m_coach_profile.sql, table/com_m_user.sql（icon_path）, table/com_m_coach_availability.sql
---------------------------------------------
-- 【背景】
-- 生徒の「専属コーチを探す」には、プロフィールを設定し終えたコーチだけを出す。必須の項目は次のとおり
-- （紹介ビデオは任意。資格の無いコーチには「None」と入力してもらう）。
--   icon            ... プロフィールアイコン（com_m_user.icon_path）
--   country         ... 国籍
--   teaching_years  ... 英語指導年数
--   education       ... 学歴
--   qualifications  ... 保有資格
--   job_experience  ... 職務経験
--   introduction    ... 自己紹介
--   availability    ... 空き時間（1件以上。無いと申請できる枠が無い）
-- 文字の項目は空白だけの入力を未入力とみなす。
--
-- 返り値: 足りない項目のコード（上の順。そろっていれば空配列。コーチのプロフィールが無ければ NULL）。
-- 項目のコードと順は、アプリ側の COACH_MATCHING_REQUIRED_ITEMS（packages/types/coachProfile.ts）と
-- 判定 getCoachMatchingMissingItems（packages/lib/coachProfile/matchingReadiness.ts）と揃える。
--
-- 内部処理専用（get_matchable_coach_ids() / get_coach_matching_status() から呼ぶ）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_coach_matching_missing_items(p_coach_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT array_remove(ARRAY[
        CASE WHEN NULLIF(btrim(u.icon_path), '') IS NULL THEN 'icon' END,
        CASE WHEN p.country_code IS NULL THEN 'country' END,
        CASE WHEN p.teaching_years IS NULL THEN 'teaching_years' END,
        CASE WHEN NULLIF(btrim(p.education, E' \t\r\n　'), '') IS NULL THEN 'education' END,
        CASE WHEN NULLIF(btrim(p.qualifications, E' \t\r\n　'), '') IS NULL THEN 'qualifications' END,
        CASE WHEN NULLIF(btrim(p.job_experience, E' \t\r\n　'), '') IS NULL THEN 'job_experience' END,
        CASE WHEN NULLIF(btrim(p.introduction, E' \t\r\n　'), '') IS NULL THEN 'introduction' END,
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM public.com_m_coach_availability a
            WHERE a.coach_id = p.user_id AND a.delete_flg = '0'
        ) THEN 'availability' END
    ], NULL)
    FROM public.com_m_coach_profile p
    JOIN public.com_m_user u ON u.id = p.user_id
    WHERE p.user_id = p_coach_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_coach_matching_missing_items(uuid) FROM PUBLIC, anon, authenticated;
