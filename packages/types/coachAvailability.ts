/**
 * ----------------------------------------------
 * コーチ空き時間（専属コーチマッチング機能）型定義
 * ----------------------------------------------
 */

// 曜日ラベル（表示用途はポータル側で言語別に定義する。ここでは値の並び順のみ規定）
export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayOfWeek = typeof DAYS_OF_WEEK[number]; // 0:日 ... 6:土

/**
 * CoachAvailabilitySlot: com_m_coach_availability の1レコード
 * day_of_week / start_time / end_time はコーチ本人のローカル時刻（壁時計時刻）で保持される。
 */
export interface CoachAvailabilitySlot {
  availability_id: string;
  coach_id: string;
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM:SS"
  end_time: string;   // "HH:MM:SS"
  delete_flg: string;
  insert_date: string;
  update_date: string;
}

export interface CoachAvailabilityFormValues {
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
}

export type CoachAvailabilityErrorCode =
  | 'unauthorized'
  | 'invalid_input'
  | 'db_insert_failed'
  | 'db_delete_failed'
  | 'unexpected_error';

export type GetCoachAvailabilityResult =
  | { success: true; slots: CoachAvailabilitySlot[] }
  | { success: false; errorCode: CoachAvailabilityErrorCode };

export type AddCoachAvailabilityResult =
  | { success: true; slot: CoachAvailabilitySlot }
  | { success: false; errorCode: CoachAvailabilityErrorCode };

export type DeleteCoachAvailabilityResult =
  | { success: true }
  | { success: false; errorCode: CoachAvailabilityErrorCode };
