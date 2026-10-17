import { z } from 'zod';
import { TRIAL_FIELD_LIMITS, TRIAL_OCCUPATION_OTHER, TRIAL_OCCUPATIONS, type TrialApplicationInput } from '@gabby/types/trialApplication';

/*
 * Webトライアルの申込フォームの入力チェック（フォームとサーバーアクションで共通）。
 * フォームの値は文字列のまま扱い、サーバーアクションで toTrialApplicationInput に変換する。
 */

const ROMAJI_PATTERN = /^[A-Za-z][A-Za-z '-]*$/;
const OCCUPATION_CODES = TRIAL_OCCUPATIONS.map((o) => String(o.code));

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label}を入力してください`).max(max, `${label}は${max}文字以内で入力してください`);

const optionalText = (label: string, max: number) => z.string().trim().max(max, `${label}は${max}文字以内で入力してください`);

const romaji = (label: string) =>
  requiredText(label, TRIAL_FIELD_LIMITS.latinName).regex(ROMAJI_PATTERN, `${label}は半角の英字で入力してください`);

export const trialApplicationSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'メールアドレスを入力してください')
      .max(TRIAL_FIELD_LIMITS.email, `メールアドレスは${TRIAL_FIELD_LIMITS.email}文字以内で入力してください`)
      .pipe(z.email('メールアドレスの形式が正しくありません')),
    lastName: requiredText('姓', TRIAL_FIELD_LIMITS.name),
    firstName: requiredText('名', TRIAL_FIELD_LIMITS.name),
    lastNameLatin: romaji('姓（ローマ字）'),
    firstNameLatin: romaji('名（ローマ字）'),
    timezone: z.string().min(1, 'お住まいの地域のタイムゾーンを選んでください'),
    countryCity: optionalText('国・都市', TRIAL_FIELD_LIMITS.countryCity),
    occupation: z.string().refine((value) => OCCUPATION_CODES.includes(value), '業種・職業を選んでください'),
    occupationOther: optionalText('業種・職業', TRIAL_FIELD_LIMITS.occupationOther),
    message: optionalText('ご要望・ご質問', TRIAL_FIELD_LIMITS.message),
    // 個人情報保護方針への同意（必須。同意の日時は申込の日時として扱い、列には持たない）
    agreePrivacy: z.boolean().refine((value) => value, '個人情報保護方針への同意が必要です'),
  })
  .superRefine((values, ctx) => {
    if (values.occupation === String(TRIAL_OCCUPATION_OTHER) && !values.occupationOther) {
      ctx.addIssue({ code: 'custom', path: ['occupationOther'], message: '業種・職業を入力してください' });
    }
  });

export type TrialApplicationFormValues = z.input<typeof trialApplicationSchema>;

export const TRIAL_FORM_DEFAULTS: TrialApplicationFormValues = {
  email: '',
  lastName: '',
  firstName: '',
  lastNameLatin: '',
  firstNameLatin: '',
  timezone: 'Asia/Tokyo',
  countryCity: '',
  occupation: '',
  occupationOther: '',
  message: '',
  agreePrivacy: false,
};

/** 検証済みの値を申込の入力に変換する（メールアドレスは小文字にそろえ、「その他」以外の記入は捨てる） */
export function toTrialApplicationInput(values: z.output<typeof trialApplicationSchema>): TrialApplicationInput {
  const occupation = Number(values.occupation);
  return {
    email: values.email.toLowerCase(),
    lastName: values.lastName,
    firstName: values.firstName,
    lastNameLatin: values.lastNameLatin,
    firstNameLatin: values.firstNameLatin,
    timezone: values.timezone,
    countryCity: values.countryCity,
    occupation,
    occupationOther: occupation === TRIAL_OCCUPATION_OTHER ? values.occupationOther : '',
    message: values.message,
  };
}
