import { AUTH_ERROR_MESSAGES_JA, type AuthErrorCode } from './errors';

/**
 * 🔒 パスワードの強度を検証する共通関数
 *
 * 💡 'use server' ディレクティブを持つ actions.ts から分離。
 * Server Actionsモジュールはエクスポートする関数を全てasyncにする必要があるため、
 * 同期的なバリデーション関数はこちらの純粋なユーティリティファイルに切り出す。
 */
export function getPasswordStrengthErrorCode(password: string): AuthErrorCode | null {
  // 最小文字数を8文字以上に強化
  if (!password || password.length < 8) {
    return 'password_too_short';
  }

  // 英字と数字の混在を必須化
  const hasAlpha = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasAlpha || !hasNumber) {
    return 'password_needs_alnum';
  }

  return null;
}

/** 日本語の文言で返す版（文言を解決する仕組みを持たない呼び出し元向け） */
export function validatePasswordStrength(password: string): string | null {
  const code = getPasswordStrengthErrorCode(password);
  return code ? AUTH_ERROR_MESSAGES_JA[code] : null;
}
