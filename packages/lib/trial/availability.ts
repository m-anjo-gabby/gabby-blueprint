/**
 * Webトライアルの申込を受け付けているか（環境変数 TRIAL_APPLICATION_ENABLED。本番は試験運用の間 false にして
 * /trial を開けなくする）。未設定・不明な値は受け付けない（設定漏れで公開しない）。
 */
export function isTrialApplicationEnabled(value: string | undefined = process.env.TRIAL_APPLICATION_ENABLED): boolean {
  return value?.trim().toLowerCase() === 'true';
}
