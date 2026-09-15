import { useUserStore } from '../stores/useUserStore';

const DEFAULT_TIMEZONE = 'Asia/Tokyo';

/** ログインユーザーのIANAタイムゾーン名を返す（未設定時は'Asia/Tokyo'にフォールバック）。 */
export function useTimezone(): string {
  return useUserStore((state) => state.user?.timezone) || DEFAULT_TIMEZONE;
}
