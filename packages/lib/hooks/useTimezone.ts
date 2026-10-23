import { useViewer } from './useViewer';

const DEFAULT_TIMEZONE = 'Asia/Tokyo';

/**
 * ログイン中の利用者のIANAタイムゾーン名を返す（未設定時は'Asia/Tokyo'にフォールバック）。
 * サーバーの描画の時点から正しい値にするため、ストアではなく `useViewer` から読む。
 */
export function useTimezone(): string {
  return useViewer()?.timezone || DEFAULT_TIMEZONE;
}
