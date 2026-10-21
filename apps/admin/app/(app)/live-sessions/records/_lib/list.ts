/**
 * 実施記録一覧の絞り込み（URL のクエリ名）。
 * month = 開始月 YYYY-MM（日本時間）、coach = コーチID、
 * result = 結果（unrecorded / completed / left_early / no_show / coach_absent / technical）、
 * via = 実施方法（app / external）、review = '1' で要確認だけ
 */
export const SESSION_RECORD_LIST_FILTERS = ['month', 'coach', 'result', 'via', 'review'] as const;

export const SESSION_RECORD_RESULT_VALUES = [
  'unrecorded',
  'completed',
  'left_early',
  'no_show',
  'coach_absent',
  'technical',
] as const;
export const SESSION_RECORD_VIA_VALUES = ['app', 'external'] as const;

/** 月の絞り込みの選択肢の数（今月から遡る） */
export const SESSION_RECORD_MONTH_OPTION_COUNT = 12;
