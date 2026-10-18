import {
  COACH_MATCHING_REQUIRED_ITEMS,
  type CoachMatchingRequiredItem,
  type CoachMatchingStatus,
  type CoachProfileFormValues,
} from '@gabby/types/coachProfile';

export interface CoachMatchingReadinessInput {
  iconPath: string | null;
  profile: CoachProfileFormValues;
  hasAvailability: boolean;
}

const isBlank = (value: string | null) => !value?.trim();

/**
 * 生徒の「専属コーチを探す」に出るために足りない必須項目（COACH_MATCHING_REQUIRED_ITEMS の順）。
 * 一覧に出すかどうかの判定は DB の fn_coach_matching_missing_items() が正本で、こちらは画面で
 * 入力中の値から即座に表示するための同じ定義（項目を変える場合は両方を直す）。
 */
export function getCoachMatchingMissingItems({
  iconPath,
  profile,
  hasAvailability,
}: CoachMatchingReadinessInput): CoachMatchingRequiredItem[] {
  const filled: Record<CoachMatchingRequiredItem, boolean> = {
    icon: !isBlank(iconPath),
    country: !!profile.country_code,
    teaching_years: profile.teaching_years !== null,
    education: !isBlank(profile.education),
    qualifications: !isBlank(profile.qualifications),
    job_experience: !isBlank(profile.job_experience),
    introduction: !isBlank(profile.introduction),
    availability: hasAvailability,
  };
  return COACH_MATCHING_REQUIRED_ITEMS.filter((item) => !filled[item]);
}

/** 生徒の一覧に出るか（デモコーチはデモの生徒にだけ出るが、ここでは区別しない） */
export function isCoachMatchable(
  status: Pick<CoachMatchingStatus, 'missingItems' | 'acceptingStudents' | 'isSuspended'>,
): boolean {
  return status.acceptingStudents && !status.isSuspended && status.missingItems.length === 0;
}
