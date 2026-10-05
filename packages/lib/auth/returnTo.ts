/**
 * ログイン後に元の画面へ戻すための「戻り先」の扱い（3ポータル共通）。
 *
 * 未ログインで保護された画面（メール内のチャットルームへのリンク等）を開いた場合、proxy が
 * `/login?next=<元のパス>` へ転送し、ログイン成功後に signIn がそのパスへ戻す。
 * 外部サイトへの転送（オープンリダイレクト）に悪用されないよう、戻り先は必ず sanitizeReturnTo を通す。
 */

/** 戻り先を渡すクエリパラメータ名 */
export const RETURN_TO_PARAM = 'next';

const MAX_RETURN_TO_LENGTH = 512;

/**
 * 戻り先として安全なアプリ内パスだけを返す（不正・不要な場合は null）。
 * - `/` で始まるアプリ内の相対パスのみ許可（`//evil.com` や `/\evil.com` のようなプロトコル相対URLは拒否）
 * - ログイン画面自身や、トップ（`/`）は戻り先として扱わない
 */
export function sanitizeReturnTo(value: string | null | undefined, loginPath = '/login'): string | null {
  if (!value || value.length > MAX_RETURN_TO_LENGTH) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  // 制御文字（改行等）を含むものは拒否
  if ([...value].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return null;
  const pathname = value.split(/[?#]/)[0];
  if (pathname === '/' || pathname === loginPath || pathname.startsWith(`${loginPath}/`)) return null;
  return value;
}

/** 戻り先付きのログイン画面のパス（戻り先が無効なら loginPath のみ） */
export function buildLoginPath(loginPath: string, returnTo: string | null | undefined): string {
  const safe = sanitizeReturnTo(returnTo, loginPath);
  return safe ? `${loginPath}?${RETURN_TO_PARAM}=${encodeURIComponent(safe)}` : loginPath;
}
