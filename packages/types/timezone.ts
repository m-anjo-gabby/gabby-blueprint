/**
 * TimezoneMaster: com_m_timezone マスタの1レコード
 * IANAタイムゾーンデータベース準拠（timezone列はPostgreSQLのタイムゾーン識別子としてそのまま利用可能）
 */
export interface TimezoneMaster {
  timezone: string; // IANAタイムゾーン名（PK, 例: 'Asia/Tokyo'）
  display_name_ja: string;
  display_name_en: string;
  /** 日時に添える短い名前（例: 日本時間 / Japan Time）。夏時間で変わらない名前 */
  short_name_ja: string;
  short_name_en: string;
  sort_no: number;
  delete_flg: string;
  insert_date: string;
  update_date: string;
}
