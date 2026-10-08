import { expect } from "@playwright/test";

/**
 * Resend に送信済みのメールを読み取る（メールの受信・文面をE2Eで確かめるため）。
 *
 * - 読み取りには「Full access」の API キーが必要（アプリの RESEND_API_KEY は送信専用で読めない）。
 *   testing/.env.local の RESEND_TEST_READ_API_KEY に設定する。未設定ならメール受信のテストはスキップする。
 * - 宛先は Resend のテスト用アドレス（`delivered+<ラベル>@resend.dev`）を使う。実在の宛先に送らず、
 *   バウンスで送信元ドメインの評価を下げないため。
 */

const RESEND_API = "https://api.resend.com";

export const resendReadApiKey = (): string | undefined => process.env.RESEND_TEST_READ_API_KEY || undefined;

/** Resend のテスト用アドレス（配信成功として扱われる） */
export const resendTestAddress = (label: string): string => `delivered+${label}@resend.dev`;

interface ResendEmailSummary {
  id: string;
  to: string[];
  subject: string;
  created_at: string;
}

export interface ResendEmail extends ResendEmailSummary {
  html: string | null;
  /** テキスト版 */
  text: string | null;
}

async function resendGet<T>(path: string): Promise<T> {
  const key = resendReadApiKey();
  if (!key) throw new Error("RESEND_TEST_READ_API_KEY が未設定です（testing/.env.local）。");
  const res = await fetch(`${RESEND_API}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Resend API ${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/**
 * 指定の宛先に `since` 以降に送られたメールを待って取得する（送信は非同期のため、見つかるまで取り直す）。
 * 同じ宛先に複数のメールを送る場合は、subject で件名を絞る。
 */
export async function waitForEmail(params: { to: string; since: Date; subject?: RegExp; timeoutMs?: number }): Promise<ResendEmail> {
  let found: ResendEmailSummary | undefined;
  await expect
    .poll(
      async () => {
        const list = await resendGet<{ data: ResendEmailSummary[] }>("/emails?limit=50");
        found = list.data.find(
          (mail) =>
            mail.to.includes(params.to) &&
            new Date(mail.created_at).getTime() >= params.since.getTime() - 5_000 &&
            (!params.subject || params.subject.test(mail.subject))
        );
        return !!found;
      },
      { timeout: params.timeoutMs ?? 60_000, intervals: [2_000, 3_000, 5_000], message: `メールが届かない: ${params.to}` }
    )
    .toBe(true);
  return resendGet<ResendEmail>(`/emails/${found!.id}`);
}

/** メール本文から、アプリへのリンク（パスとクエリ）を取り出す。送信元の NEXT_PUBLIC_SITE_URL に依らずテスト対象のサーバーで開けるようにする */
export function extractAppLinkPath(html: string, pathPrefix: string): string {
  const match = html.match(new RegExp(`href="(https?://[^"]*${pathPrefix.replace(/[/?]/g, "\\$&")}[^"]*)"`));
  if (!match) throw new Error(`メール本文に ${pathPrefix} へのリンクがありません`);
  const url = new URL(match[1].replace(/&amp;/g, "&"));
  return `${url.pathname}${url.search}`;
}
