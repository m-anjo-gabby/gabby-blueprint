/**
 * TimezoneMaster: com_m_timezone マスタの1レコード
 * IANAタイムゾーンデータベース準拠（timezone列はPostgreSQLのタイムゾーン識別子としてそのまま利用可能）
 */
export interface TimezoneMaster {
  timezone: string; // IANAタイムゾーン名（PK, 例: 'Asia/Tokyo'）
  display_name_ja: string;
  display_name_en: string;
  sort_no: number;
  delete_flg: string;
  insert_date: string;
  update_date: string;
}
