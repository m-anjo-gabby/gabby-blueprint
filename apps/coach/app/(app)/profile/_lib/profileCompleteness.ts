import { getCoachMatchingMissingItems } from '@gabby/lib/coachProfile/matchingReadiness';
import { COACH_PROFILE_FORM_REQUIRED_ITEMS, type CoachProfileFormValues } from '@gabby/types/coachProfile';

export interface CoachProfileFormProgress {
  filled: number;
  total: number;
}

/**
 * Public Coach Profile カードで入力する必須項目（紹介ビデオ以外）のうち、入力済みの数。
 * 必須項目の定義は生徒の「専属コーチを探す」に出る条件（getCoachMatchingMissingItems）と共有する。
 */
export function getCoachProfileFormProgress(form: CoachProfileFormValues): CoachProfileFormProgress {
  const missing = new Set(getCoachMatchingMissingItems({ iconPath: null, profile: form, hasAvailability: false }));
  const filled = COACH_PROFILE_FORM_REQUIRED_ITEMS.filter((item) => !missing.has(item)).length;
  return { filled, total: COACH_PROFILE_FORM_REQUIRED_ITEMS.length };
}
