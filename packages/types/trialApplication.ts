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

/**
 * 利用者に見せるトライアルの期間の表記（コーポレートサイトの「2週間無料体験」に合わせる）。
 * 期間（WEB_TRIAL_LICENSE_DAYS）を変える場合は、この表記も合わせて直す。
 */
export const WEB_TRIAL_PERIOD_LABEL = '2週間';

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

/** 知ったきっかけの「その他」のコード（選んだ場合は referral_source_other に記入内容を持つ） */
export const TRIAL_REFERRAL_SOURCE_OTHER = 99;

/** 知ったきっかけの選択肢（旧システムの申込フォームを引き継ぎ、Instagram を追加。コードは DB に保存するため変更しない。表示名・並び順は変えてよい） */
export const TRIAL_REFERRAL_SOURCES = [
  { code: 1, label: 'Facebook', labelEn: 'Facebook' },
  { code: 2, label: 'X（旧Twitter）', labelEn: 'X (Twitter)' },
  { code: 6, label: 'Instagram', labelEn: 'Instagram' },
  { code: 3, label: 'YouTube', labelEn: 'YouTube' },
  { code: 4, label: '検索エンジン（Google・Yahoo!など）', labelEn: 'Search engine (Google, Yahoo!, etc.)' },
  { code: 5, label: '知り合い・友人から', labelEn: 'Acquaintance / friend' },
  { code: TRIAL_REFERRAL_SOURCE_OTHER, label: 'その他', labelEn: 'Other' },
] as const;

interface TrialChoice {
  readonly code: number;
  readonly label: string;
  readonly labelEn: string;
}

/** 選択肢の表示（「その他」は記入内容を添える） */
function formatTrialChoice(
  choices: readonly TrialChoice[],
  otherCode: number,
  code: number,
  other: string | null | undefined,
  locale: 'ja' | 'en'
): string {
  const choice = choices.find((c) => c.code === code);
  const label = choice ? (locale === 'en' ? choice.labelEn : choice.label) : String(code);
  return code === otherCode && other ? `${label}（${other}）` : label;
}

/** 業種・職業の表示（「その他」は記入内容を添える） */
export function formatTrialOccupation(code: number, other: string | null | undefined, locale: 'ja' | 'en' = 'ja'): string {
  return formatTrialChoice(TRIAL_OCCUPATIONS, TRIAL_OCCUPATION_OTHER, code, other, locale);
}

/** 知ったきっかけの表示（「その他」は記入内容を添える） */
export function formatTrialReferralSource(code: number, other: string | null | undefined, locale: 'ja' | 'en' = 'ja'): string {
  return formatTrialChoice(TRIAL_REFERRAL_SOURCES, TRIAL_REFERRAL_SOURCE_OTHER, code, other, locale);
}

/** 入力の上限文字数（旧システムの申込フォームに合わせる） */
export const TRIAL_FIELD_LIMITS = {
  email: 200,
  /** 姓・名それぞれ */
  name: 20,
  /** 姓・名それぞれのローマ字 */
  latinName: 20,
  countryCity: 50,
  occupationOther: 50,
  referralSourceOther: 50,
  message: 1000,
} as const;

/**
 * 申込フォームの入力値。
 * 氏名の first / last は書く順番ではなく「名・姓」の意味（com_m_user_legal と同じ。山田 太郎 → lastName = 山田）。
 */
export interface TrialApplicationInput {
  email: string;
  lastName: string;
  firstName: string;
  lastNameLatin: string;
  firstNameLatin: string;
  timezone: string;
  countryCity: string;
  occupation: number;
  occupationOther: string;
  referralSource: number;
  referralSourceOther: string;
  message: string;
}

/** 申込者の氏名（日本語の書き方「姓 名」。メールの宛名・運営向けの表示） */
export function formatTrialApplicantName(input: Pick<TrialApplicationInput, 'lastName' | 'firstName'>): string {
  return `${input.lastName} ${input.firstName}`;
}

/**
 * 申込者のローマ字の氏名（英語の書き方「名 姓」）。本登録したユーザーの画面の名前（com_m_user.user_name）と
 * 同じ組み立て（fn_submit_trial_application が招待に入れる）。
 */
export function formatTrialApplicantNameLatin(input: Pick<TrialApplicationInput, 'lastNameLatin' | 'firstNameLatin'>): string {
  return `${input.firstNameLatin} ${input.lastNameLatin}`;
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
  last_name: string;
  first_name: string;
  last_name_latin: string;
  first_name_latin: string;
  /** 姓 名（ビューで組み立てる。検索用） */
  full_name: string;
  /** ローマ字の 名 姓（ビューで組み立てる。検索用） */
  full_name_latin: string;
  timezone: string;
  country_city: string | null;
  occupation: number;
  occupation_other: string | null;
  referral_source: number;
  referral_source_other: string | null;
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
