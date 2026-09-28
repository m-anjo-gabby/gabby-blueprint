import { USER_TYPES } from '@gabby/types/user';

/**
 * ユーザー種別ごとのポータル（admin / coach / student アプリ）のベースURL。
 * メール等、アプリの外から特定の画面を開かせるリンクは「宛先ユーザーのポータル」のURLで組み立てる。
 * 環境変数が未設定の場合は空文字を返す（呼び出し側で扱いを決める）。
 */
export function getPortalBaseUrl(userType: string | null | undefined): string {
  switch (userType) {
    case USER_TYPES.ADMIN:
      return process.env.NEXT_PUBLIC_SITE_URL || '';
    case USER_TYPES.COACH:
      return process.env.NEXT_PUBLIC_COACH_URL || '';
    default:
      return process.env.NEXT_PUBLIC_STUDENT_URL || '';
  }
}
