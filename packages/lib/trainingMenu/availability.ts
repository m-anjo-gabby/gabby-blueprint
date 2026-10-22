/**
 * 今日のトレーニングメニューを出すか（環境変数 TRAINING_MENU_ENABLED。本番は試験運用の間 false にして、
 * ホームの主役を教材・お気に入りへの案内にする）。未設定・不明な値は出さない（設定漏れで本番に出さない）。
 */
export function isTrainingMenuEnabled(value: string | undefined = process.env.TRAINING_MENU_ENABLED): boolean {
  return value?.trim().toLowerCase() === 'true';
}
