/**
 * Webトライアルの申込（com_t_trial_application）の型・定数。
 * 申込フォーム（student /trial）・本登録（packages/lib/trial）・admin の申込一覧で共通。
 */

/** 申込者が所属する固定の顧客「Webトライアル」の ID（DB の web_trial_client_id() と同じ値。変更する場合は両方を直す） */
export const WEB_TRIAL_CLIENT_ID = 'a7e1a100-0000-4000-8000-000000000001';

/** Webトライアルのプランのコード（com_m_contract_plan.plan_code。DB の関数も同じ値で判定する） */
export const WEB_TRIAL_PLAN_CODE = 'WEB_TRIAL';

/** トライアルの期間（本登録の日を含む日数。日本時間の暦日） */
export const WEB_TRIAL_LICENSE_DAYS = 14;

/** 業種・職業の「その他」のコード（選んだ場合は occupation_other に記入内容を持つ） */
export const TRIAL_OCCUPATION_OTHER = 99;

/** 業種・職業の選択肢（コードは DB に保存するため変更しない。表示名・並び順は変えてよい） */
export const TRIAL_OCCUPATIONS = [
  { code: 1, label: '会社員（事務・管理）', labelEn: 'Office worker (administration)' },
  { code: 2, label: '会社員（営業・販売）', labelEn: 'Office worker (sales)' },
  { code: 3, label: '会社員（技術・IT）', labelEn: 'Office worker (engineering / IT)' },
  { code: 4, label: '医療・福祉', labelEn: 'Healthcare / welfare' },
  { code: 5, label: '教育', labelEn: 'Education' },
  { code: 6, label: '公務員', labelEn: 'Public servant' },
  { code: 7, label: '自営業・フリーランス', labelEn: 'Self-employed / freelance' },
  { code: 8, label: '学生', labelEn: 'Student' },
  { code: 9, label: '主婦・主夫', labelEn: 'Homemaker' },
  { code: TRIAL_OCCUPATION_OTHER, label: 'その他', labelEn: 'Other' },
] as const;

export type TrialOccupationCode = (typeof TRIAL_OCCUPATIONS)[number]['code'];

/** 業種・職業の表示（「その他」は記入内容を添える） */
export function formatTrialOccupation(
  code: number,
  other: string | null | undefined,
  locale: 'ja' | 'en' = 'ja'
): string {
  const occupation = TRIAL_OCCUPATIONS.find((o) => o.code === code);
  const label = occupation ? (locale === 'en' ? occupation.labelEn : occupation.label) : String(code);
  return code === TRIAL_OCCUPATION_OTHER && other ? `${label}（${other}）` : label;
}

/** 入力の上限文字数（旧システムの申込フォームに合わせる） */
export const TRIAL_FIELD_LIMITS = {
  email: 200,
  userName: 15,
  romajiName: 20,
  countryCity: 50,
  occupationOther: 50,
  message: 1000,
} as const;

/** 申込フォームの入力値 */
export interface TrialApplicationInput {
  email: string;
  userName: string;
  romajiLastName: string;
  romajiFirstName: string;
  timezone: string;
  countryCity: string;
  occupation: number;
  occupationOther: string;
  message: string;
}

/**
 * 申込の種類（通知・サポート窓口へのメールで表示する）。
 * new: 初めての申込 / reapply: 本登録前の再申込（招待を出し直す）/
 * registered: 登録済みのアドレス（招待は作らず、本人にはログインの案内を送る）/
 * invited: トライアル以外で招待中のアドレス（招待には触れず、窓口が個別に対応する）
 */
export type TrialApplicationKind = 'new' | 'reapply' | 'registered' | 'invited';

/** 申込の状態（admin の一覧） */
export type TrialApplicationStatus = 'registered' | 'invited' | 'expired';

/** admin の申込一覧の1行 */
export interface TrialApplicationRow {
  application_id: string;
  email: string;
  user_name: string;
  romaji_last_name: string;
  romaji_first_name: string;
  timezone: string;
  country_city: string | null;
  occupation: number;
  occupation_other: string | null;
  message: string | null;
  apply_count: number;
  last_applied_at: string;
  accepted_at: string | null;
  user_id: string | null;
  invitation_expires_at: string | null;
  status: TrialApplicationStatus;
  insert_date: string;
}

/** admin の申込一覧の絞り込みに使う状態の一覧 */
export const TRIAL_APPLICATION_STATUSES: readonly TrialApplicationStatus[] = ['invited', 'registered', 'expired'];
