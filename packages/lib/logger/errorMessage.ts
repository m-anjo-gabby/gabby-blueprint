/**
 * catch で受け取った値からログ・画面用のメッセージを取り出す（サーバー・ブラウザの両方で使える）。
 * Supabase のエラー（PostgrestError 等）は Error でないオブジェクトとして投げられることがあるため、message を持つ値も扱う。
 */
export function getErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string')
    return err.message;
  return fallback;
}
