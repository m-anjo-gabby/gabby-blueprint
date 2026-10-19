/**
 * ----------------------------------------------
 * 定数・区分値
 * ----------------------------------------------
 */
/** コーチ1人に設定できる分野（kind='field'）の上限。DBの admin_set_coach_specialties() と揃える */
export const COACH_SPECIALTY_FIELD_MAX = 4;

/** 専門の種類 field: 分野（Business 等。上限あり） / skill: 指導の得意分野（Pronunciation Pro。別バッジで表示し、上限に数えない） */
export type CoachSpecialtyKind = 'field' | 'skill';

/**
 * ----------------------------------------------
 * 型定義
 * ----------------------------------------------
 */

/** CoachSpecialtyMaster: com_m_coach_specialty マスタの1レコード（専門の選択肢） */
export interface CoachSpecialtyMaster {
  specialty_code: string;
  kind: CoachSpecialtyKind;
  name_en: string;
  name_ja: string;
  sort_no: number;
}

/** 表示用の専門（名称は各ポータルの言語に合わせて選んだもの） */
export interface CoachSpecialtyTag {
  code: string;
  kind: CoachSpecialtyKind;
  label: string;
}

export type GetCoachSpecialtyListResult =
  { success: true; specialties: CoachSpecialtyMaster[] } | { success: false; errorCode: 'unexpected_error' };
