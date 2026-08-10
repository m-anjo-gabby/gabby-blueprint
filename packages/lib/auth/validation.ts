/**
 * 🔒 パスワードの強度を検証する共通関数
 *
 * 💡 'use server' ディレクティブを持つ actions.ts から分離。
 * Server Actionsモジュールはエクスポートする関数を全てasyncにする必要があるため、
 * 同期的なバリデーション関数はこちらの純粋なユーティリティファイルに切り出す。
 */
export function validatePasswordStrength(password: string): string | null {
  // 最小文字数を8文字以上に強化
  if (!password || password.length < 8) {
    return 'パスワードは8文字以上で入力してください。';
  }

  // 英字と数字の混在を必須化
  const hasAlpha = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasAlpha || !hasNumber) {
    return 'パスワードには英字と数字を両方含めてください。';
  }

  return null;
}
