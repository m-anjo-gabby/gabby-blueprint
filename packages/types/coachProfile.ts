/**
 * ----------------------------------------------
 * 型定義
 * ----------------------------------------------
 */

/**
 * CoachProfileRecord: com_m_coach_profile マスタの1レコード（コーチ公開プロフィール）
 * 生徒がコーチを選択する際に参照する公開項目。
 * education / qualifications / job_experience / introduction はコーチが入力した言語のまま
 * 各ポータルへそのまま表示する（ポータル単位の翻訳は行わない）。
 */
export interface CoachProfileRecord {
  user_id: string;
  country_code: string | null;
  coach_since: string | null; // 月初日（YYYY-MM-01）で保持
  education: string | null;
  qualifications: string | null;
  teaching_years: number | null;
  job_experience: string | null;
  introduction: string | null;
  delete_flg: string;
  insert_date: string;
  update_date: string;
}

/**
 * CoachProfileFormValues: コーチ本人による編集フォームの入力値
 */
export interface CoachProfileFormValues {
  country_code: string | null;
  coach_since: string | null;
  education: string | null;
  qualifications: string | null;
  teaching_years: number | null;
  job_experience: string | null;
  introduction: string | null;
}

export type CoachProfileErrorCode =
  | 'unauthorized'
  | 'invalid_input'
  | 'db_update_failed'
  | 'unexpected_error';

export type GetMyCoachProfileResult =
  | { success: true; profile: CoachProfileRecord }
  | { success: false; errorCode: 'unauthorized' | 'not_found' | 'unexpected_error' };

export type UpdateMyCoachProfileResult =
  | { success: true; profile: CoachProfileRecord }
  | { success: false; errorCode: CoachProfileErrorCode };

/**
 * ----------------------------------------------
 * 共有プレビューダイアログ (CoachProfileDialog) 用の型
 * ----------------------------------------------
 */

/**
 * CoachProfileDialogLabels: ダイアログ内の静的UI文言
 * 言語はポータル側（coach: 英語 / student: 日本語）で決定するため、ここでは受け取るだけ。
 */
export interface CoachProfileDialogLabels {
  closeLabel: string;
  coachSince: string;
  education: string;
  qualifications: string;
  englishTeaching: string;
  jobExperience: string;
  personalIntroduction: string;
}

/**
 * CoachProfileDialogData: ダイアログに表示する内容（フォーマット済み・表示用の値）
 * 日付や年数の文言整形（例: "Nov, 2024" / "2 years"）は呼び出し側（各ポータル）の責務とする。
 */
export interface CoachProfileDialogData {
  userName: string;
  iconUrl: string | null;
  countryName: string | null;
  countryFlagUrl: string | null;
  coachSinceLabel: string | null;
  education: string | null;
  qualifications: string | null;
  teachingYearsLabel: string | null;
  jobExperience: string | null;
  introduction: string | null;
}
