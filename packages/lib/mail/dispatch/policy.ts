/**
 * 送信処理の判定（送信の範囲・失敗の扱い・期限切れ）。
 * 秘密情報や DB を参照しない純粋な判定だけを置き、文面の検証と同じく testing/unit から確かめられるようにする。
 */

/**
 * 送信の範囲（環境変数 MAIL_DISPATCH_MODE）。
 * - all: すべての宛先に送る（本番）
 * - allowlist: MAIL_DISPATCH_RECIPIENT_ALLOWLIST のドメインにだけ送る（dev・staging。DB に実在の人のアドレスが含まれうるため）
 * - off: 送らない（緊急停止。送信待ちは確保せず PENDING のまま残し、再開後に送る。期限を過ぎた通知は再開後に送らない）
 * 未設定・不明な値は off として扱う（設定漏れで実在の人に送らないため）。
 * 招待・パスワード再設定（送信待ちを通らないアカウント関連のメール）は対象外。
 */
export type MailDispatchMode = 'all' | 'allowlist' | 'off';

export function resolveDispatchMode(value: string | undefined): MailDispatchMode {
  const mode = value?.trim().toLowerCase();
  return mode === 'all' || mode === 'allowlist' ? mode : 'off';
}

/** 許可リスト（カンマ区切りのドメイン）。空の場合は、allowlist モードではどこにも送らない */
export function parseAllowlist(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedRecipient(email: string, mode: MailDispatchMode, allowlist: string[]): boolean {
  if (mode === 'all') return true;
  if (mode === 'off') return false;
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  return allowlist.includes(domain);
}

/**
 * 送らない宛先。テスト用の固定アカウント（予約済みドメイン .example 等）へ送るとバウンスで送信元ドメインの評価が下がるため、
 * 送信待ちには残したうえで SKIPPED にする（testing/e2e/CONVENTIONS.md 2章）。
 */
export function isUndeliverableAddress(email: string): boolean {
  return /\.(example|test|invalid|localhost)$/i.test(email.trim());
}

/**
 * 送信の失敗の扱い（Resend のエラーコードで分ける）。
 * - retry: 一時的な失敗。試行回数を数えて、間隔を空けて再試行する（上限で FAILED）
 * - defer: 送信数の上限等。試行回数に数えず、delayMinutes 後に再試行する（期限切れ・開始済みの判定で、いずれ送らなくなる）
 * - fail: 再試行しても成功しない（宛先・内容の不正）。すぐ FAILED にする
 * - sent: 同じ重複防止キーで既に送信済み（送信の成功後に結果を記録できなかった行の再確保）。SENT にする
 */
export type SendFailureAction =
  | { kind: 'retry' }
  | { kind: 'defer'; delayMinutes: number }
  | { kind: 'fail' }
  | { kind: 'sent' };

export function classifySendError(code: string | null): SendFailureAction {
  switch (code) {
    case 'rate_limit_exceeded':
    case 'concurrent_idempotent_requests':
      return { kind: 'defer', delayMinutes: 1 };
    case 'daily_quota_exceeded':
    case 'monthly_quota_exceeded':
      return { kind: 'defer', delayMinutes: 60 };
    case 'validation_error':
    case 'invalid_parameter':
    case 'missing_required_field':
    case 'invalid_attachment':
      return { kind: 'fail' };
    case 'invalid_idempotent_request':
      return { kind: 'sent' };
    default:
      return { kind: 'retry' };
  }
}

/** 送信待ちに積んでから expiresAfterHours を過ぎたか（送信処理の停止・送信数の上限で遅れた通知を、古い内容のまま送らないため） */
export function isExpired(insertedAtIso: string, expiresAfterHours: number | undefined, nowMs: number): boolean {
  if (!expiresAfterHours) return false;
  return nowMs - new Date(insertedAtIso).getTime() > expiresAfterHours * 60 * 60 * 1000;
}
