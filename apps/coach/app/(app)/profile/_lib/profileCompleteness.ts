import { CoachProfileFormValues } from '@gabby/types/coachProfile';

/**
 * コーチの公開プロフィールの入力充実度を算出する（0〜100の整数）。
 * ここに含める項目は Public Coach Profile カードで実際に編集できる項目と一致させること
 * （新しい項目を追加する場合はこの配列にも追加する）。
 */
export function getCoachProfileCompleteness(form: CoachProfileFormValues, hasIntroVideo: boolean): number {
  const checks = [
    !!form.country_code,
    form.teaching_years !== null,
    !!form.education?.trim(),
    !!form.qualifications?.trim(),
    !!form.job_experience?.trim(),
    !!form.introduction?.trim(),
    hasIntroVideo,
  ];

  const filledCount = checks.filter(Boolean).length;
  return Math.round((filledCount / checks.length) * 100);
}
