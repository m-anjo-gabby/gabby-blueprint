import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * パスワード再設定の「リンク確認済み」マーカー（サーバー専用）
 *
 * 再設定リンク（recovery トークン）をサーバーで確認した時にだけ発行し、パスワードの再設定は
 * このマーカーが有効な場合に限って許可する。ログイン中の利用者が /update-password を開いても、
 * 現在のパスワード確認（プロフィールのパスワード変更）を迂回して変更できないようにするため。
 *
 * Supabase のセッション情報（amr）では、再設定リンクもマジックリンク（代理ログイン）も同じ `otp` になり
 * 区別できないため、確認したセッション（session_id）に紐づけて署名した Cookie で判定する。
 */
const RECOVERY_COOKIE_NAME = 'pw_recovery';
const RECOVERY_TTL_SECONDS = 30 * 60;

interface RecoveryMarker {
  /** 再設定リンクで確立したセッションの session_id */
  sid: string;
  /** 失効時刻（epoch ms） */
  exp: number;
}

function signingKey(): string {
  // サーバー専用の秘密値を署名鍵に流用する（ブラウザからは読めない）
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return key;
}

function sign(body: string): string {
  return createHmac('sha256', signingKey()).update(`${RECOVERY_COOKIE_NAME}.${body}`).digest('base64url');
}

function encode(marker: RecoveryMarker): string {
  const body = Buffer.from(JSON.stringify(marker), 'utf-8').toString('base64url');
  return `${body}.${sign(body)}`;
}

function decode(value: string | undefined): RecoveryMarker | null {
  if (!value) return null;
  const [body, signature] = value.split('.');
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (typeof parsed?.sid === 'string' && typeof parsed?.exp === 'number') return parsed as RecoveryMarker;
  } catch {
    // 不正な値は無効として扱う
  }
  return null;
}

/** 再設定リンクを確認したセッションにマーカーを付ける */
export async function setRecoveryMarker(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE_NAME, encode({ sid: sessionId, exp: Date.now() + RECOVERY_TTL_SECONDS * 1000 }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: RECOVERY_TTL_SECONDS,
  });
}

/** 現在のセッションが、再設定リンクを確認したセッションかどうか */
export async function hasValidRecoveryMarker(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) return false;
  const cookieStore = await cookies();
  const marker = decode(cookieStore.get(RECOVERY_COOKIE_NAME)?.value);
  return !!marker && marker.sid === sessionId && Date.now() <= marker.exp;
}

export async function clearRecoveryMarker(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(RECOVERY_COOKIE_NAME);
}
