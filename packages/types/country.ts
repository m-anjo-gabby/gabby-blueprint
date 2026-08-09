/**
 * ----------------------------------------------
 * 定数・区分値
 * ----------------------------------------------
 */
// 国旗アイコン画像のStorageバケット名
export const COUNTRY_FLAG_BUCKET = 'country-flag';

/**
 * ----------------------------------------------
 * 型定義
 * ----------------------------------------------
 */

/**
 * CountryMaster: com_m_country マスタの1レコード
 * コーチプロフィールの国籍選択・国旗アイコン表示に使用する。
 */
export interface CountryMaster {
  country_code: string; // ISO 3166-1 alpha-2 (PK, 例: 'JP')
  name_en: string;
  name_ja: string;
  icon_path: string | null;
  sort_no: number;
  delete_flg: string;
  insert_date: string;
  update_date: string;
}

export type GetCountryListResult =
  | { success: true; countries: CountryMaster[] }
  | { success: false; errorCode: 'unexpected_error' };
