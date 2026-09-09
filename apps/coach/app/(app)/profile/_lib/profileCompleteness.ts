import { CoachProfileFormValues } from '@gabby/types/coachProfile';

export interface ProfileCompleteness {
  /** 入力済み項目の割合（0〜100の整数） */
  percent: number;
  /** 未入力の項目ラベル（Public Coach Profile内での表示順） */
  missingLabels: string[];
}

interface CompletenessCheck {
  label: string;
  isFilled: boolean;
}

/**
 * コーチの公開プロフィールの入力充実度を算出する。
 * ここに含める項目は Public Coach Profile カードで実際に編集できる項目と一致させること
 * （新しい項目を追加する場合はこの配列にも追加する）。
 */
export function getCoachProfileCompleteness(
  form: CoachProfileFormValues,
  hasIntroVideo: boolean
): ProfileCompleteness {
  const checks: CompletenessCheck[] = [
    { label: 'Nationality', isFilled: !!form.country_code },
    { label: 'English Teaching', isFilled: form.teaching_years !== null },
    { label: 'Education', isFilled: !!form.education?.trim() },
    { label: 'Qualifications', isFilled: !!form.qualifications?.trim() },
    { label: 'Job Experience', isFilled: !!form.job_experience?.trim() },
    { label: 'Personal Introduction', isFilled: !!form.introduction?.trim() },
    { label: 'Introduction Video', isFilled: hasIntroVideo },
  ];

  const filledCount = checks.filter((check) => check.isFilled).length;
  const percent = Math.round((filledCount / checks.length) * 100);
  const missingLabels = checks.filter((check) => !check.isFilled).map((check) => check.label);

  return { percent, missingLabels };
}
