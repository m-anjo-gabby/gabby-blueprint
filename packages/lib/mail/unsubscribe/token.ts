import { createHmac, timingSafeEqual } from 'node:crypto';

/*
 * ログイン不要の配信停止（通知・リマインダーのメール）の URL と署名。
 * URL に宛先・区分と、その組に対する署名（HMAC）を載せ、受け口（unsubscribe/routeHandler.ts）で照合する。
 * 署名の鍵は環境変数 MAIL_UNSUBSCRIBE_SECRET（送る側の admin と、受け口の student・coach で同じ値）。
 * 未設定の環境では URL を作らない（メールの案内・List-Unsubscribe ヘッダーを付けない）。
 * 秘密の値そのものはここに書かないため、文面の検証（testing/unit）からも読み込める。
 */

/** 受け口のパス（student・coach の app/mail/unsubscribe/route.ts。proxy で公開ルートにする） */
export const UNSUBSCRIBE_PATH = '/mail/unsubscribe';

export function getUnsubscribeSecret(): string | null {
  return process.env.MAIL_UNSUBSCRIBE_SECRET || null;
}

function sign(userId: string, category: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${userId}:${category}`).digest('base64url');
}

export function verifyUnsubscribeToken({
  userId,
  category,
  token,
  secret,
}: {
  userId: string;
  category: string;
  token: string;
  secret: string;
}): boolean {
  const expected = Buffer.from(sign(userId, category, secret));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** 宛先のポータルの配信停止の URL（ポータルの URL か鍵が無ければ null） */
export function buildUnsubscribeUrl({
  portalBaseUrl,
  userId,
  category,
  secret,
}: {
  portalBaseUrl: string;
  userId: string;
  category: string;
  secret: string | null;
}): string | null {
  if (!portalBaseUrl || !secret) return null;
  const params = new URLSearchParams({ u: userId, c: category, t: sign(userId, category, secret) });
  return `${portalBaseUrl.replace(/\/+$/, '')}${UNSUBSCRIBE_PATH}?${params.toString()}`;
}

/** List-Unsubscribe（ワンクリックの配信停止。Gmail・Yahoo の一括送信者向けの要件）のヘッダー */
export function unsubscribeHeaders(unsubscribeUrl: string | null): Record<string, string> | undefined {
  if (!unsubscribeUrl) return undefined;
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
