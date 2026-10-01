/**
 * ----------------------------------------------
 * 会社情報マスタ(com_m_company_profile) 型定義
 * ----------------------------------------------
 * 法人ごとに1行を持ち、書面（PDF）の発行元として使う。
 * どの書面をどの法人名義で発行するかは DOCUMENT_ISSUER で決める。
 */

/** 会社ロゴ画像を保存するStorageバケット名（Public運用） */
export const COMPANY_LOGO_BUCKET = 'company-logo';

/** 法人コード（com_m_company_profile.company_code） */
export const COMPANY_CODES = {
  /** 日本法人（株式会社ギャビーアカデミー）: 顧客・生徒との契約主体 */
  JAPAN: 'GABBY_JP',
  /** バンクーバー法人（Global Vision Technology Vancouver, Inc.）: コーチとの業務委託契約主体 */
  VANCOUVER: 'GVT_CA',
} as const;
export type CompanyCode = (typeof COMPANY_CODES)[keyof typeof COMPANY_CODES];

/** 会社情報画面での表示順 */
export const COMPANY_CODE_ORDER: readonly CompanyCode[] = [COMPANY_CODES.JAPAN, COMPANY_CODES.VANCOUVER];

/** 書面ごとの発行元の法人 */
export const DOCUMENT_ISSUER = {
  /** コーチ向け月次支払通知書（coach） */
  coachPayNotice: COMPANY_CODES.VANCOUVER,
  /** コーチの請求書(INVOICE)（admin） */
  coachInvoice: COMPANY_CODES.VANCOUVER,
  /** 生徒向けトレーニングレポート（admin） */
  studentTrainingReport: COMPANY_CODES.JAPAN,
} as const satisfies Record<string, CompanyCode>;

/** 会社情報マスタ(com_m_company_profile)の表示用型 */
export interface CompanyProfile {
  company_code: CompanyCode;
  company_name: string; // 英語の社名
  company_name_ja: string | null; // 日本語の社名（日本法人の書面で併記。任意）
  address: string; // 改行区切り
  logo_path: string | null; // company-logoバケット内の相対パス（例: "logo-01.png"）
  tax_registration_number: string | null; // 税務登録番号（例: カナダGST/HST登録番号）。任意項目
}

export function isCompanyCode(value: string): value is CompanyCode {
  return (Object.values(COMPANY_CODES) as string[]).includes(value);
}
