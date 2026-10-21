import { isUserType, USER_TYPES, type UserType } from '@gabby/types/user';

/**
 * 利用者の区分（com_m_user.user_type）の文言のキー（common.userType の下）。
 * packages/types の getUserTypeLabel は日本語の固定の文言（coach・student と共有）のため、admin は表示言語の翻訳を使う。
 */
const USER_TYPE_LABEL_KEYS = {
  [USER_TYPES.ADMIN]: 'admin',
  [USER_TYPES.STUDENT]: 'student',
  [USER_TYPES.COACH]: 'coach',
} as const satisfies Record<UserType, string>;

/** 区分の文言のキー。区分でない値（NULL・不正な値）は unknown */
export function userTypeLabelKey(type: string | null | undefined) {
  return isUserType(type) ? USER_TYPE_LABEL_KEYS[type] : 'unknown';
}
